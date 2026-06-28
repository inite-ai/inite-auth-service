#!/bin/bash

echo "🚀 Starting INITE Auth Service..."

# Check if .env exists
if [ ! -f .env ]; then
  echo "⚠️  .env file not found. Creating from .env.example..."
  cp .env.example .env
  echo "✅ Created .env file. Please update it with your configuration."
  exit 1
fi

# Start services
docker-compose up -d

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 10

# Run migrations
echo "📦 Running database migrations..."
docker-compose exec -T auth-service npm run prisma:migrate:deploy

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
echo "          docker-compose exec -T auth-service npm run create-admin"
echo "   2. Register an OAuth client (edit scripts/register-client.example.ts first):"
echo "        docker-compose exec -T auth-service npm run register-client"
echo ""
echo "📝 View logs: docker-compose logs -f auth-service"
echo "🛑 Stop services: docker-compose down"





