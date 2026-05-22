#!/bin/bash
# INITE login via OAuth Device Authorization Grant (RFC 8628).
#
#   curl -fsSL https://auth.inite.ai/login.sh | bash
#
# What it does:
#   1. POST /v1/oauth/device_authorization → device_code + user_code + verification_uri.
#   2. Prints the user_code, opens the verification URL in your browser
#      (or asks you to open it). You approve there with your usual sign-in.
#   3. Polls /v1/oauth/token until you approve, then writes the resulting
#      access_token + refresh_token to ~/.config/inite/auth.json.
#
# After login, INITE-aware tools (MCP servers, @inite/auth-admin in CLI
# contexts) can read ~/.config/inite/auth.json to act on your behalf.
#
# Overrides:
#   AUTH_SERVICE_URL=https://auth.inite.ai
#   CLIENT_ID=inite-cli           (must be registered with device_code grant)
#   SCOPE='openid profile email'
#
# Re-running rotates the cached token.

set -euo pipefail

AUTH_SERVICE_URL="${AUTH_SERVICE_URL:-https://auth.inite.ai}"
CLIENT_ID="${CLIENT_ID:-inite-cli}"
SCOPE="${SCOPE:-openid profile email}"

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

HAVE_JQ=0
if command -v jq >/dev/null 2>&1; then HAVE_JQ=1; fi

# json_field <key> reads stdin
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
  if command -v open >/dev/null 2>&1; then open "$url" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$url" >/dev/null 2>&1 || true
  fi
}

bold "INITE login"
dim  "Server: $AUTH_SERVICE_URL"
dim  "Client: $CLIENT_ID"
echo

# ─── Step 1 — request device + user code ──────────────────────────────────────
DA=$(curl -sS -X POST "$AUTH_SERVICE_URL/v1/oauth/device_authorization" \
  -H 'Content-Type: application/json' \
  -d "{\"client_id\":\"$CLIENT_ID\",\"scope\":\"$SCOPE\"}")

DEVICE_CODE=$(printf '%s' "$DA" | json_field device_code)
USER_CODE=$(printf '%s' "$DA"   | json_field user_code)
VER_URI=$(printf '%s' "$DA"     | json_field verification_uri)
VER_URI_C=$(printf '%s' "$DA"   | json_field verification_uri_complete)
INTERVAL=$(printf '%s' "$DA"    | json_field_number interval)
EXPIRES_IN=$(printf '%s' "$DA"  | json_field_number expires_in)

if [ -z "$DEVICE_CODE" ] || [ -z "$USER_CODE" ]; then
  err "device authorization failed"
  printf '%s\n' "$DA" | head -3 >&2
  exit 1
fi
INTERVAL="${INTERVAL:-5}"
EXPIRES_IN="${EXPIRES_IN:-600}"

DEADLINE=$(( $(date +%s) + EXPIRES_IN ))

# ─── Step 2 — show the code, open browser ─────────────────────────────────────
echo
bold "Your code: $USER_CODE"
echo
if [ -n "$VER_URI_C" ]; then
  echo "Open this URL to approve (opens automatically if possible):"
  echo "  $VER_URI_C"
  open_url "$VER_URI_C"
else
  echo "Open this URL to approve:"
  echo "  $VER_URI"
  echo "Enter the code: $USER_CODE"
  open_url "$VER_URI"
fi
echo
dim "Waiting for approval… (will time out in ${EXPIRES_IN}s)"

# ─── Step 3 — poll for token ──────────────────────────────────────────────────
GRANT='urn:ietf:params:oauth:grant-type:device_code'

while :; do
  NOW=$(date +%s)
  if [ "$NOW" -ge "$DEADLINE" ]; then
    err "device code expired — re-run login"
    exit 1
  fi

  sleep "$INTERVAL"

  RES=$(curl -sS -X POST "$AUTH_SERVICE_URL/v1/oauth/token" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d "grant_type=$GRANT" \
    -d "client_id=$CLIENT_ID" \
    --data-urlencode "device_code=$DEVICE_CODE")

  ACCESS=$(printf '%s' "$RES" | json_field access_token)
  if [ -n "$ACCESS" ]; then
    REFRESH=$(printf '%s' "$RES" | json_field refresh_token)
    EXPIRES=$(printf '%s' "$RES" | json_field_number expires_in)
    EXPIRES="${EXPIRES:-3600}"
    EXP_AT=$(( $(date +%s) + EXPIRES ))

    mkdir -p "$CONFIG_DIR"
    chmod 700 "$CONFIG_DIR"
    cat > "$TOKEN_FILE" <<JSON
{
  "issuer": "$AUTH_SERVICE_URL",
  "client_id": "$CLIENT_ID",
  "access_token": "$ACCESS",
  "refresh_token": "$REFRESH",
  "expires_at": $EXP_AT
}
JSON
    chmod 600 "$TOKEN_FILE"

    echo
    ok "Logged in — token cached at $TOKEN_FILE"
    dim "expires_in: ${EXPIRES}s"
    echo
    bold "To use the token in another shell:"
    echo "  export INITE_AUTH_TOKEN=\$(jq -r .access_token $TOKEN_FILE)"
    exit 0
  fi

  ERROR=$(printf '%s' "$RES" | json_field error)
  case "$ERROR" in
    authorization_pending|"")
      # still waiting; keep polling
      ;;
    slow_down)
      INTERVAL=$(( INTERVAL + 5 ))
      warn "slow_down — backing off to ${INTERVAL}s"
      ;;
    access_denied)
      err "you denied the device approval"
      exit 1
      ;;
    expired_token)
      err "device code expired — re-run login"
      exit 1
      ;;
    *)
      err "token request failed: $ERROR"
      printf '%s\n' "$RES" | head -3 >&2
      exit 1
      ;;
  esac
done
