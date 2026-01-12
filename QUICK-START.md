# INITE Auth Service - Quick Start

## 🚀 Быстрый старт за 5 минут

### Шаг 1: Клонируйте и настройте

```bash
cd /Users/mikefluff/Documents/inite-auth-service

# Создайте .env из примера
cp .env.example .env

# Отредактируйте .env (установите пароли)
nano .env
```

### Шаг 2: Запустите сервис

```bash
# Автоматический запуск с миграциями и регистрацией клиентов
./start.sh

# Или вручную:
docker-compose up -d
docker-compose exec auth-service npm run migration:run
docker-compose exec auth-service npm run register-clients
docker-compose exec auth-service npm run create-admin
```

### Шаг 3: Проверьте

```bash
# Health check
curl http://localhost:3002/health

# OIDC Discovery
curl http://localhost:3002/.well-known/openid-configuration

# Logs
docker-compose logs -f auth-service
```

### Шаг 4: Тестовая авторизация

Откройте в браузере: http://localhost:3002/oauth/authorize?response_type=code&client_id=break3&redirect_uri=http://localhost:3000/callback&scope=openid%20profile%20email&state=test123&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256

## 📦 Production Deployment

### Шаг 1: Build и Push

```bash
docker build -t mikefluff/inite-auth-service:latest .
docker push mikefluff/inite-auth-service:latest
```

### Шаг 2: Обновите docker-compose.yml в deploy

Уже сделано! Файл `smar-chat-deploy/docker-compose.yml` обновлен.

### Шаг 3: Deploy

```bash
cd /Users/mikefluff/Documents/smar-chat-deploy

# Добавьте в .env:
# AUTH_POSTGRES_PASSWORD=...
# AUTH_REDIS_PASSWORD=...
# AUTH_JWT_SECRET=...
# AUTH_SMTP_PASS=...

docker-compose up -d auth-service auth-postgres auth-redis
```

### Шаг 4: DNS

Добавьте A-record: `auth.inite.ai` → IP вашего сервера

### Шаг 5: Verify

```bash
curl https://auth.inite.ai/health
curl https://auth.inite.ai/.well-known/openid-configuration
```

## 🔌 Интеграция с Frontend

См. подробную инструкцию: `INTEGRATION-GUIDE.md`

### Минимальный пример (React):

```typescript
// 1. Login
const login = () => {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  localStorage.setItem('code_verifier', codeVerifier);
  
  window.location.href = `https://auth.inite.ai/oauth/authorize?` +
    `response_type=code&` +
    `client_id=break3&` +
    `redirect_uri=${window.location.origin}/callback&` +
    `scope=openid profile email&` +
    `code_challenge=${codeChallenge}&` +
    `code_challenge_method=S256`;
};

// 2. Handle callback
const handleCallback = async (code: string) => {
  const codeVerifier = localStorage.getItem('code_verifier');
  
  const response = await fetch('/api/auth/token', {
    method: 'POST',
    body: JSON.stringify({ code, code_verifier }),
  });
  
  const { access_token } = await response.json();
  // Use access_token for API calls
};
```

## 📚 Документация

- `README.md` - Полное описание
- `INITE-AUTH-SERVICE-SETUP.md` - Deployment guide
- `INTEGRATION-GUIDE.md` - Frontend integration
- `INITE-AUTH-MIGRATION-SUMMARY.md` - Обзор архитектуры

## 🆘 Troubleshooting

### Проблема: Контейнер не стартует

```bash
# Проверьте логи
docker-compose logs auth-service

# Проверьте переменные окружения
docker-compose config
```

### Проблема: Database connection failed

```bash
# Проверьте что PostgreSQL запущен
docker-compose ps

# Проверьте connection string
docker-compose exec auth-service env | grep DB
```

### Проблема: Token exchange fails

Убедитесь что:
- Client ID и Secret правильные
- Redirect URI совпадает
- Code verifier соответствует code challenge

## 🎯 Next Steps

1. ✅ Deploy auth service
2. ⏳ Register OAuth clients
3. ⏳ Integrate Break3 frontend
4. ⏳ Migrate existing users
5. ⏳ Setup monitoring
6. ⏳ Configure alerts

## 📞 Support

Email: support@inite.ai





