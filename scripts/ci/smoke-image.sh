#!/usr/bin/env bash
# Boot a built image against a throwaway Postgres + Redis and require /health
# and /ready to answer — the same boot path a fresh install takes (the
# container migrates the empty database itself, then starts).
#
#   scripts/ci/smoke-image.sh <image> [platform]
#
# platform defaults to the host's; pass linux/arm64 to check an arm64 image.
# Containers are named with a unique prefix and only those are removed.
set -euo pipefail

IMAGE="${1:?usage: smoke-image.sh <image> [platform]}"
PLATFORM="${2:-}"
P="authsmoke-$$"
NET="$P-net"
plat=()
[ -n "$PLATFORM" ] && plat=(--platform "$PLATFORM")

cleanup() {
  docker rm -f "$P-app" "$P-pg" "$P-redis" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "$NET" >/dev/null
docker run -d --name "$P-pg" --network "$NET" \
  -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=auth postgres:15-alpine >/dev/null
docker run -d --name "$P-redis" --network "$NET" redis:7-alpine redis-server --requirepass smoke >/dev/null
for i in $(seq 1 30); do
  docker exec "$P-pg" pg_isready -U postgres -d auth >/dev/null 2>&1 && break
  [ "$i" = 30 ] && { echo "postgres did not start"; exit 1; }
  sleep 1
done

key="$(mktemp -d)"
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$key/k.pem" 2>/dev/null
openssl pkey -in "$key/k.pem" -pubout -out "$key/k.pub"
oneline() { awk 'BEGIN{ORS="\\n"}1' "$1"; }

docker run -d --name "$P-app" --network "$NET" "${plat[@]}" \
  -e NODE_ENV=production -e PORT=3002 \
  -e DATABASE_URL="postgresql://postgres:smoke@$P-pg:5432/auth" \
  -e REDIS_HOST="$P-redis" -e REDIS_PORT=6379 -e REDIS_PASSWORD=smoke \
  -e JWT_SECRET=smoke_jwt_secret_at_least_32_chars_long_xxxxxxxx \
  -e REFRESH_TOKEN_HMAC_SECRET=smoke_refresh_hmac_at_least_32_chars_long_xxxx \
  -e SESSION_SECRET=smoke_session_secret_at_least_32_chars_long_xx \
  -e FIELD_ENCRYPTION_KEY=smoke_field_encryption_key_at_least_32b_xxxxx \
  -e JWT_PRIVATE_KEY="$(oneline "$key/k.pem")" -e JWT_PUBLIC_KEY="$(oneline "$key/k.pub")" \
  -e JWT_ISSUER=http://localhost:3002 -e OIDC_ISSUER=http://localhost:3002 \
  -e FRONTEND_URL=http://localhost:3000 -e CORS_ORIGINS=http://localhost:3000 \
  -e RP_ID=localhost -e RP_NAME=INITE -e RP_ORIGIN=http://localhost:3000 -e DID_METHOD=key \
  "$IMAGE" >/dev/null
rm -rf "$key"

echo "arch inside container: $(docker exec "$P-app" uname -m 2>/dev/null || echo '?')"
for i in $(seq 1 60); do
  if body="$(docker exec "$P-app" wget -qO- http://localhost:3002/health 2>/dev/null)"; then
    echo "/health: $body"
    break
  fi
  if [ "$(docker inspect -f '{{.State.Running}}' "$P-app")" != true ] || [ "$i" = 60 ]; then
    echo "::error::$IMAGE did not answer /health"
    docker logs "$P-app" 2>&1 | tail -80
    exit 1
  fi
  sleep 2
done
ready="$(docker exec "$P-app" wget -qO- http://localhost:3002/ready)"
echo "/ready: $ready"
printf '%s' "$ready" | grep -q '"status":"ok"' || { docker logs "$P-app" 2>&1 | tail -80; exit 1; }
docker logs "$P-app" 2>&1 | grep '^\[migrate\]' || true
echo "smoke OK: $IMAGE ${PLATFORM:-(host platform)}"
