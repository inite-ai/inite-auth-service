#!/bin/bash
# INITE CLI login.
#
#   curl -fsSL https://auth.inite.ai/login.sh | bash
#
# Default path — Authorization Code + PKCE with loopback redirect
# (RFC 8252, "Claude-Code-style"):
#   1. Generate code_verifier + code_challenge.
#   2. Pick a free localhost port; start a one-shot HTTP listener.
#   3. Open the browser to /v1/oauth/authorize with redirect_uri
#      pointing at http://127.0.0.1:<port>/callback.
#   4. You approve in the browser; auth-service redirects to the
#      loopback; the listener captures `code` and exits.
#   5. Exchange `code` + `code_verifier` at /v1/oauth/token.
#   6. Write the token to ~/.config/inite/auth.json (0600).
#
# Fallback path — Device Authorization Grant (no browser on the same
# machine). Triggered automatically if python3 is unavailable, or
# explicitly via INITE_LOGIN_MODE=device.
#
# Overrides:
#   AUTH_SERVICE_URL=https://auth.inite.ai
#   CLIENT_ID=inite-cli
#   SCOPE='openid profile email'
#   INITE_LOGIN_MODE=auto|browser|device         (default: auto)

set -euo pipefail

AUTH_SERVICE_URL="${AUTH_SERVICE_URL:-https://auth.inite.ai}"
CLIENT_ID="${CLIENT_ID:-inite-cli}"
SCOPE="${SCOPE:-openid profile email}"
MODE="${INITE_LOGIN_MODE:-auto}"

CONFIG_DIR="${INITE_CONFIG_DIR:-$HOME/.config/inite}"
TOKEN_FILE="$CONFIG_DIR/auth.json"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
dim()  { printf '\033[2m%s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[33m⚠\033[0m %s\n' "$*"; }
err()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; }

require() {
  command -v "$1" >/dev/null 2>&1 || { err "$1 not found — install it and re-run."; exit 1; }
}

require curl
require openssl

HAVE_JQ=0
command -v jq >/dev/null 2>&1 && HAVE_JQ=1

json_field() {
  if [ "$HAVE_JQ" -eq 1 ]; then
    jq -r ".$1 // empty"
  else
    grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 \
      | sed -E "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"([^\"]*)\".*/\1/"
  fi
}

json_field_number() {
  if [ "$HAVE_JQ" -eq 1 ]; then
    jq -r ".$1 // empty"
  else
    grep -o "\"$1\"[[:space:]]*:[[:space:]]*[0-9]*" | head -1 \
      | sed -E "s/.*\"$1\"[[:space:]]*:[[:space:]]*([0-9]+).*/\1/"
  fi
}

open_url() {
  local url="$1"
  if   command -v open >/dev/null 2>&1;     then open "$url" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$url" >/dev/null 2>&1 || true
  fi
}

urlencode() {
  # Inline URL-encode without requiring python.
  local s="$1" out="" i ch
  for ((i=0; i<${#s}; i++)); do
    ch="${s:i:1}"
    case "$ch" in
      [a-zA-Z0-9.~_-]) out+="$ch" ;;
      *) printf -v hex '%%%02X' "'$ch"; out+="$hex" ;;
    esac
  done
  printf '%s' "$out"
}

write_token() {
  local access="$1" refresh="$2" expires="$3"
  local exp_at=$(( $(date +%s) + expires ))
  mkdir -p "$CONFIG_DIR"
  chmod 700 "$CONFIG_DIR"
  cat > "$TOKEN_FILE" <<JSON
{
  "issuer": "$AUTH_SERVICE_URL",
  "client_id": "$CLIENT_ID",
  "access_token": "$access",
  "refresh_token": "$refresh",
  "expires_at": $exp_at
}
JSON
  chmod 600 "$TOKEN_FILE"
}

# ─── Mode selection ───────────────────────────────────────────────────────────
HAVE_PYTHON=0
command -v python3 >/dev/null 2>&1 && HAVE_PYTHON=1

USE_BROWSER=0
case "$MODE" in
  browser) USE_BROWSER=1 ;;
  device)  USE_BROWSER=0 ;;
  auto)
    if [ "$HAVE_PYTHON" -eq 1 ]; then USE_BROWSER=1; else USE_BROWSER=0; fi
    ;;
  *) err "Unknown INITE_LOGIN_MODE: $MODE (use auto, browser, or device)"; exit 1 ;;
esac

bold "INITE login"
dim  "Server: $AUTH_SERVICE_URL"
dim  "Client: $CLIENT_ID"
dim  "Mode:   $([ $USE_BROWSER -eq 1 ] && echo 'browser + loopback' || echo 'device code')"
echo

if [ "$USE_BROWSER" -eq 1 ]; then
  # ─── Browser flow: authorization_code + PKCE + loopback ─────────────────────
  # 1. PKCE
  CODE_VERIFIER=$(openssl rand -base64 64 | tr -d '\n=+/' | head -c 64)
  CODE_CHALLENGE=$(printf '%s' "$CODE_VERIFIER" \
    | openssl dgst -binary -sha256 \
    | openssl base64 \
    | tr -d '=\n' | tr '/+' '_-')
  STATE=$(openssl rand -hex 16)

  # 2. Find a free port + start a one-shot listener that responds to
  #    /callback?code=... and writes the code to a tmp file, then exits.
  TMPDIR_RUN=$(mktemp -d -t inite-login.XXXXXX)
  CODE_FILE="$TMPDIR_RUN/code"
  PORT_FILE="$TMPDIR_RUN/port"
  trap 'rm -rf "$TMPDIR_RUN"' EXIT

  python3 - "$CODE_FILE" "$PORT_FILE" <<'PY' &
import sys, socket
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

code_file, port_file = sys.argv[1], sys.argv[2]

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>INITE · login {status_word}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root {{
    --bg: #0a0a0b;
    --bg-elevated: #131316;
    --bg-overlay: #1c1c20;
    --text: #ededef;
    --text-muted: #9b9ba3;
    --text-faint: #5f5f68;
    --border: #25252b;
    --accent: #6ea1ff;
    --success: #2fb178;
    --danger:  #f0556c;
    --status: var(--{status_color});
    --status-bg: color-mix(in srgb, var(--status) 14%, transparent);
  }}
  * {{ box-sizing: border-box; }}
  html, body {{ height: 100%; }}
  body {{
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }}
  .card {{
    width: 100%;
    max-width: 480px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 36px 32px 30px;
    box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset,
                0 12px 40px rgba(0,0,0,0.45);
  }}
  .badge {{
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 999px;
    background: var(--status-bg);
    color: var(--status);
    border: 1px solid color-mix(in srgb, var(--status) 35%, transparent);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }}
  .badge .dot {{
    width: 6px; height: 6px; border-radius: 999px;
    background: var(--status);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--status) 20%, transparent);
  }}
  h1 {{
    margin: 18px 0 6px;
    font-size: 22px;
    letter-spacing: -0.01em;
    font-weight: 600;
  }}
  p {{
    margin: 4px 0;
    color: var(--text-muted);
  }}
  .hint {{
    margin-top: 20px;
    padding: 12px 14px;
    background: var(--bg-overlay);
    border: 1px solid var(--border);
    border-radius: 10px;
    font-size: 13px;
    color: var(--text-muted);
  }}
  .hint code {{
    background: rgba(255,255,255,0.05);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1px 6px;
    color: var(--text);
    font-size: 12px;
  }}
  .footer {{
    margin-top: 24px;
    font-size: 11px;
    color: var(--text-faint);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }}
  pre {{
    background: var(--bg-overlay);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 12px;
    margin-top: 12px;
    font-size: 12.5px;
    color: var(--text);
    white-space: pre-wrap;
  }}
</style>
</head>
<body>
  <main class="card" role="alert" aria-live="polite">
    <span class="badge"><span class="dot"></span>{badge}</span>
    <h1>{headline}</h1>
    <p>{body_html}</p>
    {extra}
    <div class="footer">INITE · CLI login</div>
  </main>
</body>
</html>
"""

def render_success():
    return PAGE.format(
        status_word="complete",
        status_color="success",
        badge="Signed in",
        headline="You can close this tab",
        body_html="Return to your terminal — the token is on its way.",
        extra='<div class="hint">Tip: run <code>jq -r .access_token ~/.config/inite/auth.json</code> '
              'to read the bearer token.</div>',
    )

def render_error(detail):
    safe = (detail or 'unknown').replace('<', '&lt;').replace('>', '&gt;')
    return PAGE.format(
        status_word="error",
        status_color="danger",
        badge="Login failed",
        headline="Something went wrong",
        body_html="The authorization server returned an error.",
        extra=f'<pre>{safe}</pre>',
    )

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a, **k): pass
    def do_GET(self):
        p = urlparse(self.path)
        if p.path != '/callback':
            self.send_response(404); self.end_headers(); return
        q = parse_qs(p.query or '')
        code = (q.get('code') or [''])[0]
        err  = (q.get('error') or [''])[0]
        if err:
            payload = render_error(err)
        elif code:
            with open(code_file, 'w') as f:
                f.write(code)
            payload = render_success()
        else:
            payload = render_error('no code in callback')
        body = payload.encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
sock.bind(('127.0.0.1', 0))
port = sock.getsockname()[1]
with open(port_file, 'w') as f:
    f.write(str(port))
sock.listen(1)
sock.close()

srv = HTTPServer(('127.0.0.1', port), Handler)
srv.timeout = 600
srv.handle_request()  # one-shot
PY
  LISTENER_PID=$!

  # Wait for port to be written
  for _ in $(seq 1 50); do
    [ -s "$PORT_FILE" ] && break
    sleep 0.1
  done
  PORT=$(cat "$PORT_FILE" 2>/dev/null || echo '')
  if [ -z "$PORT" ]; then
    err "could not start loopback listener"
    kill "$LISTENER_PID" 2>/dev/null || true
    exit 1
  fi

  REDIRECT_URI="http://127.0.0.1:$PORT/callback"

  # 3. Build authorize URL + open browser
  Q_REDIRECT=$(urlencode "$REDIRECT_URI")
  Q_SCOPE=$(urlencode "$SCOPE")
  Q_STATE=$(urlencode "$STATE")
  Q_CHALLENGE=$(urlencode "$CODE_CHALLENGE")
  Q_CLIENT=$(urlencode "$CLIENT_ID")
  AUTH_URL="$AUTH_SERVICE_URL/v1/oauth/authorize?response_type=code"
  AUTH_URL+="&client_id=$Q_CLIENT&redirect_uri=$Q_REDIRECT"
  AUTH_URL+="&scope=$Q_SCOPE&state=$Q_STATE"
  AUTH_URL+="&code_challenge=$Q_CHALLENGE&code_challenge_method=S256"

  echo "If your browser doesn't open automatically, paste this:"
  echo "  $AUTH_URL"
  echo
  open_url "$AUTH_URL"
  dim "Waiting for browser approval…"

  # 4. Wait for code (listener exits when it has one)
  wait "$LISTENER_PID" 2>/dev/null || true
  CODE=$(cat "$CODE_FILE" 2>/dev/null || echo '')
  if [ -z "$CODE" ]; then
    err "did not receive an authorization code"
    exit 1
  fi
  ok "received authorization code"

  # 5. Exchange code → token
  RES=$(curl -sS -X POST "$AUTH_SERVICE_URL/v1/oauth/token" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d 'grant_type=authorization_code' \
    --data-urlencode "code=$CODE" \
    --data-urlencode "redirect_uri=$REDIRECT_URI" \
    --data-urlencode "client_id=$CLIENT_ID" \
    --data-urlencode "code_verifier=$CODE_VERIFIER")

  ACCESS=$(printf '%s' "$RES" | json_field access_token)
  if [ -z "$ACCESS" ]; then
    err "token exchange failed"
    printf '%s\n' "$RES" | head -5 >&2
    exit 1
  fi
  REFRESH=$(printf '%s' "$RES" | json_field refresh_token)
  EXPIRES=$(printf '%s' "$RES" | json_field_number expires_in)
  EXPIRES="${EXPIRES:-3600}"
  write_token "$ACCESS" "$REFRESH" "$EXPIRES"

  echo
  ok "Logged in — token cached at $TOKEN_FILE"
  dim "expires_in: ${EXPIRES}s"
  exit 0
fi

# ─── Device flow fallback ─────────────────────────────────────────────────────
DA=$(curl -sS -X POST "$AUTH_SERVICE_URL/v1/oauth/device_authorization" \
  -H 'Content-Type: application/json' \
  -d "{\"client_id\":\"$CLIENT_ID\",\"scope\":\"$SCOPE\"}")

DEVICE_CODE=$(printf '%s' "$DA" | json_field device_code)
USER_CODE=$(printf '%s'   "$DA" | json_field user_code)
VER_URI=$(printf '%s'     "$DA" | json_field verification_uri)
VER_URI_C=$(printf '%s'   "$DA" | json_field verification_uri_complete)
INTERVAL=$(printf '%s'    "$DA" | json_field_number interval)
EXPIRES_IN=$(printf '%s'  "$DA" | json_field_number expires_in)

if [ -z "$DEVICE_CODE" ] || [ -z "$USER_CODE" ]; then
  err "device authorization failed"
  printf '%s\n' "$DA" | head -3 >&2
  exit 1
fi
INTERVAL="${INTERVAL:-5}"
EXPIRES_IN="${EXPIRES_IN:-600}"
DEADLINE=$(( $(date +%s) + EXPIRES_IN ))

echo
bold "Your code: $USER_CODE"
echo
echo "Open this URL and approve:"
echo "  ${VER_URI_C:-$VER_URI}"
open_url "${VER_URI_C:-$VER_URI}"
dim "Waiting for approval…"

GRANT='urn:ietf:params:oauth:grant-type:device_code'

while :; do
  [ "$(date +%s)" -ge "$DEADLINE" ] && { err 'device code expired — re-run login'; exit 1; }
  sleep "$INTERVAL"

  RES=$(curl -sS -X POST "$AUTH_SERVICE_URL/v1/oauth/token" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d "grant_type=$GRANT" \
    --data-urlencode "client_id=$CLIENT_ID" \
    --data-urlencode "device_code=$DEVICE_CODE")

  ACCESS=$(printf '%s' "$RES" | json_field access_token)
  if [ -n "$ACCESS" ]; then
    REFRESH=$(printf '%s' "$RES" | json_field refresh_token)
    EXPIRES=$(printf '%s' "$RES" | json_field_number expires_in)
    EXPIRES="${EXPIRES:-3600}"
    write_token "$ACCESS" "$REFRESH" "$EXPIRES"
    echo
    ok "Logged in — token cached at $TOKEN_FILE"
    exit 0
  fi

  ERROR=$(printf '%s' "$RES" | json_field error)
  case "$ERROR" in
    authorization_pending|"") ;;
    slow_down) INTERVAL=$(( INTERVAL + 5 )); warn "slow_down — interval ${INTERVAL}s" ;;
    access_denied)  err 'you denied the device approval'; exit 1 ;;
    expired_token)  err 'device code expired — re-run login'; exit 1 ;;
    *)              err "token request failed: $ERROR"; exit 1 ;;
  esac
done
