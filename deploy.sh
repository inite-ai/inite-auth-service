#!/bin/bash

# Deploy script for INITE Auth Service
# This script should be placed on your server at /opt/projects/inite-auth-service/

set -e

echo "🚀 Starting INITE Auth Service deployment..."

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | xargs)
    echo "✅ Environment variables loaded from .env"
else
    echo "❌ Error: .env file not found"
    exit 1
fi

# Navigate to project directory
cd /opt/projects/inite-auth-service

# Pull latest images
echo "📦 Pulling latest Docker images..."
docker pull mikefluff/inite-auth-service:latest
docker pull mikefluff/inite-auth-frontend:latest

# Stop running containers
echo "🛑 Stopping running containers..."
docker-compose down

# Start new containers
echo "▶️ Starting new containers..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 20

# Run migrations
echo "🗄️ Running database migrations..."
docker exec inite-auth-service npm run migration:run || {
    echo "⚠️ Migrations failed or already applied"
}

# Create admin user if needed
echo "👤 Creating admin user..."
docker exec inite-auth-service npm run create-admin || {
    echo "⚠️ Admin user already exists"
}

# Register OAuth clients if needed
echo "🔐 Registering OAuth clients..."
docker exec inite-auth-service npm run register-all-clients || {
    echo "⚠️ OAuth clients already registered"
}

# Check if services are running
echo "🔍 Checking service status..."
if docker-compose ps | grep -q "Up"; then
    echo "✅ Deployment successful!"
    echo "📊 Service status:"
    docker-compose ps
    echo ""
    echo "🌐 Services available at:"
    echo "   - https://auth.inite.ai"
    echo ""
    echo "🔍 Health check:"
    curl -f https://auth.inite.ai/health && echo "" || echo "⚠️ Health check failed"
else
    echo "❌ Deployment failed!"
    echo "📋 Container logs:"
    docker-compose logs --tail=50
    exit 1
fi

# Clean up unused images and containers
echo "🧹 Cleaning up..."
docker system prune -f

echo "🎉 Deployment completed successfully!"

