#!/usr/bin/env bash
# Runs once when the dev container is created: install deps, seed .env,
# migrate the database through the one migration path (scripts/migrate.js).
set -euo pipefail

npm ci --no-audit --no-fund
(cd frontend && npm ci --no-audit --no-fund)

# .env supplies the non-infrastructure settings; the container environment
# (docker-compose.yml) overrides DATABASE_URL, REDIS_* and PORT.
[ -f .env ] || cp .env.example .env

npm run migrate

echo "Ready: npm run start:dev  ->  http://localhost:3002/health"
