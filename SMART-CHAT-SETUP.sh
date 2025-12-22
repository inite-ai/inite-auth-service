#!/bin/bash

# 🚀 Quick Setup Script для интеграции Smart Chat с INITE Auth Service
# Автоматизирует процесс настройки OAuth клиента

set -e

echo "🔐 INITE Auth Service - Smart Chat Setup"
echo "========================================="
echo ""

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Проверка что мы в правильной директории
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found${NC}"
    echo "Please run this script from inite-auth-service directory"
    exit 1
fi

echo "📋 Step 1: Checking environment..."
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env file not found, creating from .env.example${NC}"
    cp .env.example .env
    echo -e "${GREEN}✅ Created .env file${NC}"
    echo -e "${YELLOW}⚠️  Please edit .env and add your configuration!${NC}"
    echo ""
    read -p "Press Enter when you've configured .env..."
fi

echo ""
echo "🐳 Step 2: Starting Docker containers..."
docker-compose up -d

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 10

echo ""
echo "📊 Step 3: Running database migrations..."
docker-compose exec -T auth-service npm run migration:run || {
    echo -e "${RED}❌ Migration failed${NC}"
    exit 1
}

echo ""
echo "🔑 Step 4: Registering Smart Chat OAuth client..."
docker-compose exec -T auth-service npm run register-smart-chat-client || {
    echo -e "${RED}❌ Client registration failed${NC}"
    exit 1
}

echo ""
echo "✅ Step 5: Creating admin user (optional)..."
docker-compose exec -T auth-service npm run create-admin || {
    echo -e "${YELLOW}⚠️  Admin creation skipped or failed${NC}"
}

echo ""
echo "🔍 Step 6: Verifying setup..."
sleep 2

# Health check
HEALTH_STATUS=$(curl -s http://localhost:3002/health || echo "FAILED")
if [[ "$HEALTH_STATUS" == *"ok"* ]]; then
    echo -e "${GREEN}✅ Auth service is healthy${NC}"
else
    echo -e "${RED}❌ Auth service health check failed${NC}"
    echo "Response: $HEALTH_STATUS"
fi

# OIDC Discovery check
DISCOVERY=$(curl -s http://localhost:3002/.well-known/openid-configuration || echo "FAILED")
if [[ "$DISCOVERY" == *"issuer"* ]]; then
    echo -e "${GREEN}✅ OIDC Discovery endpoint working${NC}"
else
    echo -e "${RED}❌ OIDC Discovery endpoint failed${NC}"
fi

echo ""
echo "========================================="
echo -e "${GREEN}🎉 Setup Complete!${NC}"
echo "========================================="
echo ""
echo "📝 Next steps:"
echo ""
echo "1. Save your CLIENT_SECRET from the output above"
echo "2. Add to backend .env:"
echo "   AUTH_SERVICE_URL=http://localhost:3002"
echo "   AUTH_CLIENT_ID=smart-chat"
echo "   AUTH_CLIENT_SECRET=<your_client_secret>"
echo ""
echo "3. Add to frontend .env:"
echo "   REACT_APP_AUTH_SERVICE_URL=http://localhost:3002"
echo "   REACT_APP_AUTH_CLIENT_ID=smart-chat"
echo ""
echo "4. Check services status:"
echo "   docker-compose ps"
echo ""
echo "5. View logs:"
echo "   docker-compose logs -f auth-service"
echo ""
echo "📚 Documentation:"
echo "   - README.md"
echo "   - INTEGRATION-GUIDE.md"
echo "   - /Users/mikefluff/Documents/OAUTH-MIGRATION-GUIDE.md"
echo ""



