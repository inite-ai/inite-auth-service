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

# Run migrations (if needed)
echo "📦 Running database migrations..."
docker-compose exec -T auth-service npm run migration:run

# Register OAuth clients
echo "🔐 Registering OAuth clients..."
docker-compose exec -T auth-service npm run register-clients

# Create admin user
echo "👤 Creating admin user..."
docker-compose exec -T auth-service npm run create-admin

echo ""
echo "✅ INITE Auth Service is running!"
echo ""
echo "🌍 Service URL: http://localhost:3002"
echo "🔍 Health check: http://localhost:3002/health"
echo "📖 OIDC Discovery: http://localhost:3002/.well-known/openid-configuration"
echo ""
echo "📝 View logs: docker-compose logs -f auth-service"
echo "🛑 Stop services: docker-compose down"



