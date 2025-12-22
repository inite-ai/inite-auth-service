# 🚀 Deployment Checklist для INITE Auth Service

## Pre-Deployment

### 1. GitHub Setup
- [ ] Создать GitHub repository: `inite-auth-service`
- [ ] Добавить GitHub Secret: `DOCKERHUB_TOKEN`
- [ ] Настроить self-hosted runner на production сервере
- [ ] Push код в repository

### 2. DockerHub
- [ ] Создать repository: `mikefluff/inite-auth-service`
- [ ] Создать repository: `mikefluff/inite-auth-frontend`
- [ ] Создать access token для GitHub Actions

### 3. Server Preparation
- [ ] Установить Docker и Docker Compose
- [ ] Установить GitHub Actions runner
- [ ] Настроить firewall (открыть порты 80, 443, 3002)
- [ ] Установить Traefik или Nginx для reverse proxy

### 4. DNS Configuration
- [ ] Добавить A-record: `auth.inite.ai` → Server IP
- [ ] Подождать DNS propagation (до 24 часов)
- [ ] Проверить: `dig auth.inite.ai`

### 5. Environment Variables
На сервере создать `/home/ubuntu/smar-chat-deploy/.env`:

```bash
# Auth Service
AUTH_POSTGRES_PASSWORD=<generate-secure-password>
AUTH_REDIS_PASSWORD=<generate-secure-password>
AUTH_JWT_SECRET=<generate-with-openssl-rand-base64-32>
AUTH_SMTP_PASS=<mailgun-smtp-password>

# OAuth Client Secrets
BREAK3_CLIENT_SECRET=<generate>
CLUB_CLIENT_SECRET=<generate>
HEALTH_CLIENT_SECRET=<generate>
EVENTS_CLIENT_SECRET=<generate>
ESTATE_CLIENT_SECRET=<generate>
EDUCATION_CLIENT_SECRET=<generate>
```

## Deployment Steps

### 1. Initial Deploy

```bash
# На вашей машине
cd /Users/mikefluff/Documents/inite-auth-service
git init
git add .
git commit -m "Initial commit: INITE Auth Service"
git branch -M main
git remote add origin https://github.com/YOUR_ORG/inite-auth-service.git
git push -u origin main
```

GitHub Actions автоматически:
1. ✅ Соберет Docker images
2. ✅ Запушит в DockerHub
3. ✅ Задеплоит на production
4. ✅ Запустит migrations
5. ✅ Зарегистрирует OAuth clients
6. ✅ Создаст admin user

### 2. Verify Deployment

```bash
# Health check
curl https://auth.inite.ai/health

# OIDC Discovery
curl https://auth.inite.ai/.well-known/openid-configuration

# Frontend
open https://auth.inite.ai
```

### 3. Test Authentication

1. Откройте https://auth.inite.ai
2. Попробуйте каждый метод:
   - [ ] Passkey registration и login
   - [ ] Magic link email
   - [ ] Password login
3. Проверьте account page
4. Попробуйте link wallet

### 4. Test OAuth Flow

```bash
# Создайте тестовый запрос
open "https://auth.inite.ai/oauth/authorize?\
response_type=code&\
client_id=break3&\
redirect_uri=http://localhost:3000/callback&\
scope=openid%20profile%20email&\
code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&\
code_challenge_method=S256&\
state=test123"
```

Проверьте:
- [ ] Показывается UI выбора метода
- [ ] Успешная авторизация
- [ ] Редирект с кодом

## Post-Deployment

### 1. SSL Certificates
Traefik автоматически получит Let's Encrypt сертификаты.

Проверьте:
```bash
curl -I https://auth.inite.ai
# Должен быть 200 OK и https
```

### 2. Database Backup

```bash
# SSH на сервер
ssh ubuntu@your-server

# Настроить автоматический backup
cat > /home/ubuntu/backup-auth-db.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker exec inite-auth-postgres pg_dump -U postgres inite_auth > \
  /home/ubuntu/backups/auth_db_$DATE.sql
# Keep only last 7 days
find /home/ubuntu/backups/ -name "auth_db_*.sql" -mtime +7 -delete
EOF

chmod +x /home/ubuntu/backup-auth-db.sh

# Add to crontab
crontab -e
# Add: 0 2 * * * /home/ubuntu/backup-auth-db.sh
```

### 3. Monitoring Setup

```bash
# Проверьте логи
docker logs inite-auth-service -f

# Мониторинг памяти
docker stats inite-auth-service

# Alerts (TODO)
# Настроить уведомления при падении сервиса
```

### 4. Register Additional OAuth Clients

```bash
# SSH на сервер
docker exec -it inite-auth-service npm run register-clients
```

### 5. Documentation

- [ ] Обновить INTEGRATION-GUIDE.md с production URLs
- [ ] Создать документацию для разработчиков
- [ ] Поделиться OAuth credentials с командами модулей

## Integration with Modules

### Break3

```bash
cd /Users/mikefluff/Documents/smar-chat
# Обновить auth на OAuth2 flow
# См. INTEGRATION-GUIDE.md
```

### Club, Health, Events, Estate, Education

```bash
# Для каждого модуля:
1. Получить client_id и client_secret
2. Добавить OAuth2 flow
3. Настроить redirect URIs
4. Протестировать SSO
```

## Rollback Plan

Если что-то пошло не так:

```bash
# SSH на сервер
ssh ubuntu@your-server
cd ~/smar-chat-deploy

# Откатить на предыдущую версию
docker pull mikefluff/inite-auth-service:<previous-sha>
docker-compose up -d auth-service

# Или откатить миграции
docker exec inite-auth-service npm run migration:revert
```

## Security Checklist

- [ ] Все passwords secure (20+ chars, random)
- [ ] JWT_SECRET длинный и случайный
- [ ] HTTPS working (Let's Encrypt)
- [ ] CORS настроен только для whitelisted origins
- [ ] Rate limiting (TODO)
- [ ] Firewall настроен
- [ ] SSH key-only (no password auth)
- [ ] Regular security updates

## Performance Checklist

- [ ] Database indexes созданы
- [ ] Redis для session caching
- [ ] Docker resource limits настроены
- [ ] CDN для static assets (TODO)
- [ ] Monitoring и alerts

## Final Checks

- [ ] ✅ Health endpoint работает
- [ ] ✅ OIDC discovery работает
- [ ] ✅ Frontend загружается
- [ ] ✅ Passkey authentication работает
- [ ] ✅ Magic link отправляется
- [ ] ✅ OAuth flow работает
- [ ] ✅ Database backups настроены
- [ ] ✅ SSL certificates активны
- [ ] ✅ Logs доступны
- [ ] ✅ Monitoring работает

## Next Steps

1. [ ] Интегрировать Break3 с новым auth
2. [ ] Мигрировать пользователей
3. [ ] Настроить monitoring и alerts
4. [ ] Добавить rate limiting
5. [ ] Настроить staging environment
6. [ ] Создать admin panel
7. [ ] Добавить analytics

---

**Date**: 15 декабря 2024  
**Status**: Ready for deployment  
**Deployed by**: DevOps Team



