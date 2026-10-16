#!/usr/bin/env bash
# Prove that the one migration path — the image's own `node scripts/migrate.js`
# (prisma migrate deploy underneath) — works on every database it will meet:
#
#   fresh      an empty Postgres
#   tracked    a v1.11.2 install as production built it: schema bootstrapped
#              before tracking, arrays converted by migrate-arrays.js, 0001
#              resolved, 0002…0025 applied by v1.11.2's `migrate deploy`
#   untracked  a v1.11.2 self-host install as its docs built it: the old
#              start.sh's `migrate deploy` failed on the empty DB (leaving a
#              failed 0001 row), then `prisma db push`
#
# For each: migrate succeeds, `prisma migrate diff` against schema.prisma is
# empty, seeded rows survive, and a second run applies nothing.
#
#   scripts/ci/verify-migration-paths.sh <image> <old-checkout-dir>
#
# <old-checkout-dir> is a checkout of the previous release (e.g. a worktree of
# inite-auth-service-v1.11.2) with `npm ci` done — its own prisma CLI and
# scripts produce the old states. Only containers named authmig-<pid>-* are
# created and removed.
set -euo pipefail

IMAGE="${1:?usage: verify-migration-paths.sh <image> <old-checkout-dir>}"
OLD="$(cd "${2:?old checkout dir}" && pwd)"
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
P="authmig-$$"
NET="$P-net"
PORT="${PG_PORT:-55499}"
PASS=mig

cleanup() {
  docker rm -f "$P-pg" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() { echo "::error::$*"; exit 1; }
step() { printf '\n==== %s\n' "$*"; }

docker network create "$NET" >/dev/null
docker run -d --name "$P-pg" --network "$NET" -p "127.0.0.1:$PORT:5432" \
  -e POSTGRES_PASSWORD=$PASS postgres:15-alpine >/dev/null
for i in $(seq 1 30); do
  docker exec "$P-pg" pg_isready -U postgres >/dev/null 2>&1 && break
  [ "$i" = 30 ] && fail "postgres did not start"
  sleep 1
done
sleep 2

psql_() { docker exec -i "$P-pg" psql -U postgres -v ON_ERROR_STOP=1 -qtA "$@"; }
host_url() { echo "postgresql://postgres:$PASS@127.0.0.1:$PORT/$1"; }
net_url() { echo "postgresql://postgres:$PASS@$P-pg:5432/$1"; }
newdb() { psql_ -c "CREATE DATABASE $1"; }

# The image under test, exactly as it runs in a container.
image_migrate() {
  docker run --rm --network "$NET" -e DATABASE_URL="$(net_url "$1")" "$IMAGE" node scripts/migrate.js
}
image_diff_empty() {
  docker run --rm --network "$NET" -e DATABASE_URL="$(net_url "$1")" "$IMAGE" \
    node node_modules/prisma/build/index.js migrate diff \
    --from-config-datasource --to-schema prisma/schema.prisma --exit-code \
    || fail "$1: schema differs from prisma/schema.prisma after migrate"
}
# The previous release's own CLI, run from its checkout.
old_prisma() {
  local db="$1"; shift
  (cd "$OLD" && DATABASE_URL="$(host_url "$db")" CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1 \
    node node_modules/prisma/build/index.js "$@")
}

seed() {
  psql_ -d "$1" <<'SQL'
INSERT INTO users (id, did, email, name, "updatedAt")
  VALUES ('11111111-1111-1111-1111-111111111111', 'did:key:z6Mkseed', 'seed@example.com', 'Seed User', now());
INSERT INTO oauth_clients (id, "clientId", "clientSecretHash", name, "redirectUris", "allowedScopes", "updatedAt")
  VALUES ('22222222-2222-2222-2222-222222222222', 'seed-app', 'x', 'Seed App',
          ARRAY['https://app.example.com/cb'], ARRAY['openid','profile'], now());
INSERT INTO refresh_tokens (id, "tokenLookup", "userId", "clientId", "expiresAt")
  VALUES ('33333333-3333-3333-3333-333333333333', 'lookup-seed',
          '11111111-1111-1111-1111-111111111111', 'seed-app', now() + interval '7 days');
SQL
}
fingerprint() {
  psql_ -d "$1" -c "
    SELECT string_agg(x, ' | ' ORDER BY x) FROM (
      SELECT 'user:' || did || ':' || email FROM users
      UNION ALL SELECT 'client:' || \"clientId\" || ':' || array_to_string(\"redirectUris\", ',')
                       || ':' || array_to_string(\"allowedScopes\", ',') FROM oauth_clients
      UNION ALL SELECT 'rt:' || \"tokenLookup\" || ':' || \"clientId\" FROM refresh_tokens
    ) t(x)"
}
history() { psql_ -d "$1" -c "SELECT count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) || ' applied, ' || count(*) FILTER (WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL) || ' unfinished' FROM _prisma_migrations"; }

expect_noop() {
  local out
  out="$(image_migrate "$1" 2>&1)" || { echo "$out"; fail "$1: second run failed"; }
  echo "$out" | grep -E '^\[migrate\]|pending' || true
  echo "$out" | grep -q 'No pending migrations to apply' || fail "$1: second run was not a no-op"
  echo "$out" | grep -q 'resolve' && fail "$1: second run recorded migrations again"
  return 0
}

after_upgrade() {
  local db="$1" before="$2"
  image_diff_empty "$db"
  local now; now="$(fingerprint "$db")"
  [ "$now" = "$before" ] || fail "$db: data changed across the upgrade:\n  before: $before\n  after:  $now"
  echo "rows intact: $now"
  echo "history: $(history "$db")"
  [ "$(psql_ -d "$db" -c "SELECT count(*) FROM _prisma_migrations WHERE migration_name = '0000_baseline'")" = 1 ] \
    || fail "$db: 0000_baseline not recorded"
  step "$db: rerun is a no-op"
  expect_noop "$db"
}

# --------------------------------------------------------------------------
step "fresh: empty database"
newdb fresh
image_migrate fresh
image_diff_empty fresh
echo "history: $(history fresh)"
step "fresh: rerun is a no-op"
expect_noop fresh

# --------------------------------------------------------------------------
step "tracked: v1.11.2 as production built it"
newdb tracked
# The pre-tracking schema: 0000_baseline, with the three array columns back
# as the text they were before migrate-arrays.js converted them.
sed -E \
  -e 's/"redirectUris" TEXT\[\],/"redirectUris" TEXT,/' \
  -e "s/\"allowedScopes\" TEXT\[\] DEFAULT ARRAY\[\]::TEXT\[\],/\"allowedScopes\" TEXT DEFAULT '{}',/" \
  -e "s/\"allowedGrants\" TEXT\[\] DEFAULT ARRAY\['authorization_code', 'refresh_token'\]::TEXT\[\],/\"allowedGrants\" TEXT DEFAULT '{authorization_code,refresh_token}',/" \
  "$HERE/prisma/migrations/0000_baseline/migration.sql" | psql_ -d tracked
[ "$(psql_ -d tracked -c "SELECT data_type FROM information_schema.columns WHERE table_name='oauth_clients' AND column_name='allowedScopes'")" = text ] \
  || fail "tracked: could not build the pre-tracking text-column shape"
psql_ -d tracked -c "INSERT INTO oauth_clients (id, \"clientId\", \"clientSecretHash\", name, \"redirectUris\", \"allowedScopes\", \"updatedAt\")
  VALUES ('44444444-4444-4444-4444-444444444444', 'legacy-app', 'x', 'Legacy', 'https://legacy.example.com/cb', '{openid}', now())"
# v1.11.2's container CMD, then its deploy.yml migration steps.
(cd "$OLD" && DATABASE_URL="$(host_url tracked)" node scripts/migrate-arrays.js)
old_prisma tracked migrate resolve --applied 0001_convert_text_to_array
old_prisma tracked migrate deploy
seed tracked
before="$(fingerprint tracked)"
echo "v1.11.2 state — history: $(history tracked); rows: $before"
step "tracked: upgrade with the new image"
image_migrate tracked
after_upgrade tracked "$before"

# --------------------------------------------------------------------------
step "untracked: v1.11.2 self-host as its docs built it"
newdb untracked
if old_prisma untracked migrate deploy; then
  fail "untracked: expected v1.11.2's migrate deploy to fail on an empty database"
fi
echo "(v1.11.2 migrate deploy failed on the empty database, as reported)"
old_prisma untracked db push
seed untracked
before="$(fingerprint untracked)"
echo "v1.11.2 state — history: $(history untracked); rows: $before"
step "untracked: upgrade with the new image"
image_migrate untracked
after_upgrade untracked "$before"

printf '\nALL MIGRATION PATHS OK (%s)\n' "$IMAGE"
