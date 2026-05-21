#!/bin/bash
# INITE @inite/auth-admin installer
#
#   curl -fsSL https://auth.inite.ai/install.sh | bash
#
# What it does:
#   1. Asks (or reads from env) for an INITE admin email + password.
#   2. Logs into the prod IdP to obtain a short-lived access token.
#   3. Ensures the shared OAuth client `inite-auth-admin-tools` exists
#      with `grants=[client_credentials]` and `scopes=[admin]`. If it
#      already exists, optionally rotates its secret.
#   4. Writes the resulting AUTH_ADMIN_TOOLS_* env vars into the
#      vertical's .env.local (or .env), appending — never overwriting
#      unrelated keys.
#   5. Prints the two-line bootstrap snippet for src/lib/domain/assistant/register.ts.
#
# Override via env vars (non-interactive run):
#   ADMIN_EMAIL=...
#   ADMIN_PASSWORD=...
#   AUTH_SERVICE_URL=https://auth.inite.ai       (default)
#   ROTATE=true                                  (force rotate if client exists)
#   ENV_FILE=.env.local                          (default; falls back to .env)
#
# Re-running is safe. The script never prints the secret to stdout if
# rotation is requested — it goes straight to the env file.

set -euo pipefail

AUTH_SERVICE_URL="${AUTH_SERVICE_URL:-https://auth.inite.ai}"
CLIENT_ID="inite-auth-admin-tools"
CLIENT_NAME="INITE Auth-Admin Tools (M2M)"
ENV_FILE="${ENV_FILE:-.env.local}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
dim()  { printf '\033[2m%s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
err()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; }

require() {
  command -v "$1" >/dev/null 2>&1 || { err "$1 not found — install it and re-run."; exit 1; }
}

require curl
require openssl

# jq is preferred but optional — fall back to grep+sed if missing.
HAVE_JQ=0
if command -v jq >/dev/null 2>&1; then HAVE_JQ=1; fi

json_field() {
  # json_field <key>  reads stdin
  if [ "$HAVE_JQ" -eq 1 ]; then
    jq -r ".$1 // empty"
  else
    # crude — works for flat string values
    grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed -E "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"([^\"]*)\".*/\1/"
  fi
}

bold "INITE @inite/auth-admin installer"
dim  "Target IdP: $AUTH_SERVICE_URL"
echo

# ─── 1. Admin credentials ─────────────────────────────────────────────────────
if [ -z "${ADMIN_EMAIL:-}" ]; then
  printf "Admin email: "
  read -r ADMIN_EMAIL
fi
if [ -z "${ADMIN_PASSWORD:-}" ]; then
  printf "Admin password: "
  stty -echo
  read -r ADMIN_PASSWORD
  stty echo
  echo
fi

# ─── 2. Login ─────────────────────────────────────────────────────────────────
LOGIN_RES=$(curl -sS -X POST "$AUTH_SERVICE_URL/v1/auth/password/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")

ACCESS=$(printf '%s' "$LOGIN_RES" | json_field access_token)
if [ -z "$ACCESS" ]; then
  err "login failed"
  printf '%s\n' "$LOGIN_RES" | head -3 >&2
  exit 1
fi
ok "logged in as $ADMIN_EMAIL"

# Quick admin probe — fail fast if the user isn't actually an admin.
PROBE=$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $ACCESS" \
  "$AUTH_SERVICE_URL/v1/admin/oauth-clients")
if [ "$PROBE" != "200" ]; then
  err "user $ADMIN_EMAIL is not an admin (got HTTP $PROBE on /v1/admin/oauth-clients)"
  exit 1
fi
ok "admin check passed"

# ─── 3. Provision / rotate client ─────────────────────────────────────────────
EXISTING=$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $ACCESS" \
  "$AUTH_SERVICE_URL/v1/admin/oauth-clients/$CLIENT_ID")

NEW_SECRET=""

if [ "$EXISTING" = "200" ]; then
  dim "client '$CLIENT_ID' already exists"
  if [ "${ROTATE:-false}" = "true" ]; then
    bold "rotating client secret (10-min grace window)…"
    ROT=$(curl -sS -X POST \
      -H "Authorization: Bearer $ACCESS" \
      -H 'Content-Type: application/json' \
      -d '{"graceWindowSeconds":600}' \
      "$AUTH_SERVICE_URL/v1/admin/oauth-clients/$CLIENT_ID/rotate-secret")
    NEW_SECRET=$(printf '%s' "$ROT" | json_field clientSecret)
    if [ -z "$NEW_SECRET" ]; then
      NEW_SECRET=$(printf '%s' "$ROT" | json_field client_secret)
    fi
    if [ -z "$NEW_SECRET" ]; then
      err "rotation failed — response did not contain a new secret"
      printf '%s\n' "$ROT" | head -3 >&2
      exit 1
    fi
    ok "secret rotated"
  else
    dim "skip rotation. To rotate: ROTATE=true curl … | bash"
    echo
    bold "If you already have the secret, set it in your vertical's $ENV_FILE:"
    echo  "  AUTH_ADMIN_TOOLS_CLIENT_ID=$CLIENT_ID"
    echo  "  AUTH_ADMIN_TOOLS_CLIENT_SECRET=<your-existing-secret>"
    echo  "  AUTH_SERVICE_URL=$AUTH_SERVICE_URL"
    exit 0
  fi
elif [ "$EXISTING" = "404" ]; then
  bold "registering '$CLIENT_ID'…"
  NEW_SECRET=$(openssl rand -hex 32)
  CREATE=$(curl -sS -X POST \
    -H "Authorization: Bearer $ACCESS" \
    -H 'Content-Type: application/json' \
    -d "$(cat <<JSON
{
  "name": "$CLIENT_NAME",
  "clientId": "$CLIENT_ID",
  "clientSecret": "$NEW_SECRET",
  "redirectUris": [],
  "allowedScopes": ["admin"],
  "allowedGrants": ["client_credentials"],
  "allowedAudiences": []
}
JSON
)" \
    "$AUTH_SERVICE_URL/v1/admin/oauth-clients")
  CID=$(printf '%s' "$CREATE" | json_field clientId)
  if [ -z "$CID" ]; then CID=$(printf '%s' "$CREATE" | json_field client_id); fi
  if [ "$CID" != "$CLIENT_ID" ]; then
    err "registration failed"
    printf '%s\n' "$CREATE" | head -5 >&2
    exit 1
  fi
  ok "client '$CLIENT_ID' registered"
else
  err "unexpected probe response: HTTP $EXISTING for /v1/admin/oauth-clients/$CLIENT_ID"
  exit 1
fi

# ─── 4. Write env file ────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ] && [ -f ".env" ]; then
  ENV_FILE=".env"
fi
touch "$ENV_FILE"

# Idempotent upsert of three keys.
upsert() {
  local key="$1" value="$2" file="$3"
  if grep -q "^$key=" "$file"; then
    # Use a different delimiter since value may contain /
    sed -i.bak "s|^$key=.*|$key=$value|" "$file" && rm -f "${file}.bak"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

upsert AUTH_ADMIN_TOOLS_CLIENT_ID     "$CLIENT_ID"        "$ENV_FILE"
upsert AUTH_ADMIN_TOOLS_CLIENT_SECRET "$NEW_SECRET"       "$ENV_FILE"
upsert AUTH_SERVICE_URL               "$AUTH_SERVICE_URL" "$ENV_FILE"

ok "wrote AUTH_ADMIN_TOOLS_CLIENT_ID, _SECRET, AUTH_SERVICE_URL to $ENV_FILE"

# ─── 5. Print bootstrap snippet ───────────────────────────────────────────────
echo
bold "Bootstrap snippet (paste once into src/lib/domain/assistant/register.ts):"
cat <<'SNIPPET'

  import { registerAuthAdminTool, authAdminSkills } from '@inite/auth-admin';
  import { registerSkill } from '@inite/skills';

  registerAuthAdminTool();
  for (const s of authAdminSkills) registerSkill(s);

SNIPPET

bold "Done. Restart the vertical so it picks up the new env."
