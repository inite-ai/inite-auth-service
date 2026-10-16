#!/bin/bash

echo "🚀 Starting INITE Auth Service..."

# Check if .env exists
if [ ! -f .env ]; then
  echo "⚠️  .env file not found. Creating from .env.example..."
  cp .env.example .env
  echo "✅ Created .env file. Please update it with your configuration."
  exit 1
fi

# Pick the compose CLI that exists (plugin `docker compose`, or legacy binary).
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  COMPOSE="docker-compose"
fi

# Start services. The auth-service container migrates its own database on
# boot (scripts/migrate.js → prisma migrate deploy) — empty database or an
# existing install alike — so there is no separate migration step.
$COMPOSE up -d

echo "⏳ Waiting for the service (database migration runs first)..."
for i in $(seq 1 90); do
  if curl -sf http://localhost:3002/health >/dev/null 2>&1; then
    break
  fi
  if [ "$i" = "90" ]; then
    echo "❌ auth-service did not become healthy in 180s. Logs:"
    $COMPOSE logs --tail=100 auth-service
    exit 1
  fi
  sleep 2
done
$COMPOSE logs auth-service 2>/dev/null | grep '\[migrate\]' || true

echo ""
echo "✅ INITE Auth Service is running!"
echo ""
echo "🌍 Service URL: http://localhost:3002"
echo "🔍 Health check: http://localhost:3002/health"
echo "📖 OIDC Discovery: http://localhost:3002/.well-known/openid-configuration"
echo ""
echo "👉 Next steps:"
echo "   1. Create an admin user:"
echo "        ADMIN_PASSWORD=\$(openssl rand -base64 24) \\"
echo "          $COMPOSE exec -T auth-service npm run create-admin"
echo "   2. Register an OAuth client (edit scripts/register-client.example.ts first):"
echo "        $COMPOSE exec -T auth-service npm run register-client"
echo ""
echo "📝 View logs: $COMPOSE logs -f auth-service"
echo "🛑 Stop services: $COMPOSE down"
