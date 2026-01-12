# Environment Variables Setup

## Required GitHub Secrets

Add these secrets to your GitHub repository (`Settings` → `Secrets and variables` → `Actions` → `New repository secret`):

### 1. Database
```
Name: POSTGRES_PASSWORD
Value: <your-secure-postgres-password>
```
**Generate with:**
```bash
openssl rand -base64 32
```

### 2. Redis
```
Name: REDIS_PASSWORD
Value: <your-secure-redis-password>
```
**Generate with:**
```bash
openssl rand -base64 32
```

### 3. JWT Secret
```
Name: JWT_SECRET
Value: <your-secure-jwt-secret>
```
**Generate with:**
```bash
openssl rand -base64 64
```

### 4. SMTP (Mailgun) - только секретные данные
```
Name: SMTP_USER
Value: postmaster@your-mailgun-domain.com

Name: SMTP_PASS
Value: <your-mailgun-smtp-password>
```
**Get from:** Mailgun Dashboard → Sending → Domain Settings → SMTP Credentials

**Примечание:** Остальные настройки SMTP (SMTP_HOST, SMTP_PORT, SMTP_FROM, FRONTEND_URL, SUPPORT_EMAIL) не являются секретами и задаются в docker-compose.yml или переменных окружения.

### 5. DockerHub (Already set)
```
Name: DOCKERHUB_TOKEN
Value: <your-dockerhub-access-token>
```

---

## Quick Setup Commands

```bash
# Generate all secrets at once
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32)"
echo "REDIS_PASSWORD=$(openssl rand -base64 32)"
echo "JWT_SECRET=$(openssl rand -base64 64)"
```

## Local Development `.env`

For local testing, create `.env` file in project root:

```bash
# Database
POSTGRES_PASSWORD=local_dev_password

# Redis
REDIS_PASSWORD=local_dev_redis_password

# JWT
JWT_SECRET=local_dev_jwt_secret_at_least_32_chars_long

# Email (optional for local dev)
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=2525
SMTP_USER=your_mailgun_user
SMTP_PASS=your_mailgun_pass
SMTP_FROM=noreply@inite.ai
FRONTEND_URL=http://localhost:3000
SUPPORT_EMAIL=support@inite.ai
```

**⚠️ Never commit `.env` file to git!** (Already in `.gitignore`)

---

## Verify Setup

After adding GitHub secrets, trigger a deployment:

```bash
# Via GitHub Actions UI
Repository → Actions → Deploy to Production → Run workflow

# Or via push to main
git push origin main
```

Check logs for:
```
✅ .env file created
✅ All health checks passed
```





