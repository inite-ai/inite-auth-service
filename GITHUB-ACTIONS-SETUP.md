# GitHub Actions Setup для INITE Auth Service

## 🚀 Автоматический деплой на auth.inite.ai

### Архитектура CI/CD

```
┌─────────────────────────────────────────────────────────┐
│  GitHub Repository: inite-auth-service                  │
│                                                         │
│  Push to main                                           │
│       │                                                 │
│       ▼                                                 │
│  ┌──────────────────────────────┐                      │
│  │  Workflow: build-and-push    │                      │
│  │  - Build backend image       │                      │
│  │  - Build frontend image      │                      │
│  │  - Push to DockerHub         │                      │
│  └──────────┬───────────────────┘                      │
│             │                                           │
│             ▼                                           │
│  ┌──────────────────────────────┐                      │
│  │  Workflow: deploy            │                      │
│  │  - Pull images               │                      │
│  │  - Deploy to production      │                      │
│  │  - Run migrations            │                      │
│  │  - Register OAuth clients    │                      │
│  │  - Health checks             │                      │
│  └──────────┬───────────────────┘                      │
│             │                                           │
└─────────────┼───────────────────────────────────────────┘
              │
              ▼
    ┌─────────────────────┐
    │  Production Server  │
    │  auth.inite.ai      │
    └─────────────────────┘
```

## 📋 Предварительные требования

### 1. GitHub Secrets

Добавьте в Settings → Secrets and variables → Actions:

```bash
DOCKERHUB_TOKEN=<your-dockerhub-access-token>
```

### 2. Self-Hosted Runner на сервере

На production сервере:

```bash
# Install runner
cd ~
mkdir actions-runner && cd actions-runner
curl -o actions-runner-linux-x64-2.311.0.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz
tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz

# Configure (follow prompts)
./config.sh --url https://github.com/YOUR_ORG/inite-auth-service --token YOUR_TOKEN

# Install as service
sudo ./svc.sh install
sudo ./svc.sh start
```

### 3. Структура на сервере

```bash
/home/ubuntu/smar-chat-deploy/
├── docker-compose.yml    # Обновлен с auth services
├── .env                  # Environment variables
└── nginx/
    └── conf.d/
```

## 🔄 Workflows

### 1. Build and Push (build-and-push.yml)

**Триггеры:**
- Push в `main` branch
- Manual trigger через GitHub UI

**Что делает:**
- Собирает Docker images для backend и frontend
- Тегирует как `latest` и `<commit-sha>`
- Пушит в DockerHub
- Использует cache для быстрой сборки

**Компоненты:**
- `all` - собрать всё
- `backend` - только backend
- `frontend` - только frontend

### 2. Deploy (deploy.yml)

**Триггеры:**
- После успешного Build and Push
- Manual trigger через GitHub UI

**Что делает:**
- Пуллит latest images с DockerHub
- Запускает `docker-compose up -d` на production
- Запускает database migrations
- Регистрирует OAuth clients (первый раз)
- Создает admin user (первый раз)
- Проверяет health endpoints
- Показывает логи в случае ошибки

**Компоненты:**
- `all` - деплоить всё (auth-service + auth-postgres + auth-redis)
- `auth-service` - только backend
- `auth-frontend` - только frontend (когда добавите в docker-compose)

### 3. Test (test.yml)

**Триггеры:**
- Pull Requests в `main`
- Push в `develop`

**Что делает:**
- Запускает linter
- Запускает тесты (когда добавите)
- Проверяет сборку
- Security audit

## 🎯 Использование

### Автоматический деплой

Просто push в `main`:

```bash
git add .
git commit -m "feat: add new feature"
git push origin main
```

GitHub Actions автоматически:
1. Соберет Docker images
2. Запушит в DockerHub
3. Задеплоит на production
4. Проверит health

### Ручной деплой

1. Перейдите в Actions → Deploy to Production
2. Нажмите "Run workflow"
3. Выберите компонент (all/auth-service/auth-frontend)
4. Нажмите "Run workflow"

### Деплой только backend

```bash
# Через GitHub UI:
Actions → Deploy to Production → Run workflow → auth-service

# Или через CLI:
gh workflow run deploy.yml -f component=auth-service
```

### Деплой только frontend

```bash
gh workflow run deploy.yml -f component=auth-frontend
```

## 🔍 Мониторинг деплоя

### GitHub Actions UI

Смотрите в реальном времени:
1. Repository → Actions
2. Выберите workflow run
3. Следите за логами каждого step

### На сервере

```bash
# SSH на сервер
ssh ubuntu@your-server

# Смотрите логи
cd ~/smar-chat-deploy
docker-compose logs -f auth-service

# Проверьте статус
docker-compose ps | grep auth

# Health check
curl https://auth.inite.ai/health
```

## ⚠️ Troubleshooting

### Build failed

```bash
# Проверьте логи в GitHub Actions
# Обычные причины:
- Syntax errors в коде
- Missing dependencies
- Docker build errors

# Фиксите локально:
npm run build
docker build -t test .
```

### Deploy failed

```bash
# SSH на сервер
ssh ubuntu@your-server

# Проверьте images
docker images | grep inite-auth

# Проверьте что runner работает
cd ~/actions-runner
./run.sh

# Перезапустите services
cd ~/smar-chat-deploy
docker-compose restart auth-service
```

### Health check failed

```bash
# Проверьте логи
docker logs inite-auth-service --tail 100

# Обычные причины:
- Database connection failed
- Redis connection failed
- Port already in use
- Missing environment variables

# Проверьте .env
cat ~/smar-chat-deploy/.env | grep AUTH_
```

### Migrations failed

```bash
# Запустите вручную
docker exec inite-auth-service npm run migration:run

# Откатите если нужно
docker exec inite-auth-service npm run migration:revert
```

## 🔐 Security

### Secrets в GitHub

- ✅ `DOCKERHUB_TOKEN` - для push images
- ✅ Все sensitive данные в `.env` на сервере
- ❌ НЕ коммитьте `.env` в репозиторий!

### Environment на сервере

```bash
# /home/ubuntu/smar-chat-deploy/.env
AUTH_POSTGRES_PASSWORD=<secure-password>
AUTH_REDIS_PASSWORD=<secure-password>
AUTH_JWT_SECRET=<generate-with-openssl>
AUTH_SMTP_PASS=<mailgun-password>
```

## 📊 Workflow Status Badges

Добавьте в README.md:

```markdown
![Build](https://github.com/YOUR_ORG/inite-auth-service/actions/workflows/build-and-push.yml/badge.svg)
![Deploy](https://github.com/YOUR_ORG/inite-auth-service/actions/workflows/deploy.yml/badge.svg)
![Tests](https://github.com/YOUR_ORG/inite-auth-service/actions/workflows/test.yml/badge.svg)
```

## 🎉 Успешный деплой

После успешного деплоя:

```bash
✅ Images built and pushed
✅ Services deployed
✅ Migrations applied
✅ OAuth clients registered
✅ Health checks passed

🌐 Auth service: https://auth.inite.ai
🔍 OIDC Discovery: https://auth.inite.ai/.well-known/openid-configuration
💚 Health: https://auth.inite.ai/health
```

## 📚 Дополнительно

### Rollback

```bash
# Откатиться на предыдущую версию
docker pull mikefluff/inite-auth-service:<previous-sha>
docker tag mikefluff/inite-auth-service:<previous-sha> \
  mikefluff/inite-auth-service:latest
docker-compose up -d auth-service
```

### Blue-Green Deployment (TODO)

Для zero-downtime deployments можно настроить:
- Запустить новую версию на другом порту
- Переключить Traefik/Nginx
- Остановить старую версию

### Staging Environment (TODO)

Создать отдельный workflow для staging:
- Branch: `develop`
- Domain: `auth-staging.inite.ai`
- Отдельная база данных

## 🆘 Support

При проблемах:
1. Проверьте GitHub Actions logs
2. Проверьте Docker logs на сервере
3. Проверьте health endpoints
4. Свяжитесь с DevOps

---

**Created**: 15 декабря 2024  
**Last Updated**: 15 декабря 2024  
**Status**: ✅ Ready to use



