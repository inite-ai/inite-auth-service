# Domain Separation for Auth Service

## Problem
Backend API и Frontend были на одном домене `auth.inite.ai`, что создавало конфликты роутинга в Traefik:
- Backend перехватывал запросы к frontend routes через PathPrefix `/auth`
- Получали 404 на `/auth/login` потому что это был frontend route, но попадал на backend
- Priority routing не решал проблему полностью

## Solution
Разделили на два отдельных домена:

### Backend API: `auth-api.inite.ai`
- **Все API endpoints**: `/oauth/*`, `/auth/*`, `/identity/*`, `/admin/*`, `/api/*`, `/.well-known/*`
- **Traefik rule**: `Host('auth-api.inite.ai')` - все запросы идут на backend
- **Port**: 3002
- **Container**: `inite-auth-service`

### Frontend: `auth.inite.ai`
- **Все UI pages**: `/login`, `/register`, `/verify`, `/account`, etc.
- **Traefik rule**: `Host('auth.inite.ai')` - все запросы идут на frontend
- **Port**: 3003
- **Container**: `inite-auth-frontend`

## Changes Made

### 1. INITE Auth Service
**Files**: `.github/workflows/deploy.yml`, `docker-compose.yml`
- Added `API_DOMAIN=auth-api.inite.ai`
- Backend Traefik rule: `Host('auth-api.inite.ai')`
- Frontend Traefik rule: `Host('auth.inite.ai')`
- Updated `JWT_ISSUER` and `OIDC_ISSUER` to `https://auth-api.inite.ai`
- Added `FRONTEND_URL=https://auth.inite.ai`
- Added `API_URL=https://auth-api.inite.ai`
- Updated CORS to include both domains

### 2. Break3 Frontend
**Files**: `src/services/authOAuthService.js`, `.github/workflows/deploy.yml`
- Updated default `AUTH_SERVICE_URL` from `https://auth.inite.ai` to `https://auth-api.inite.ai`
- Updated env var `REACT_APP_AUTH_SERVICE_URL=https://auth-api.inite.ai`

### 3. Break3 Backend
**Files**: `.github/workflows/deploy.yml`
- Updated `AUTH_SERVICE_URL=https://auth-api.inite.ai`

### 4. Break3 Admin
**Files**: `src/config.ts`, `src/authOAuthProvider.ts`, `.github/workflows/deploy.yml`
- Updated default `authServiceUrl` to `https://auth-api.inite.ai`
- Updated env var `REACT_APP_AUTH_SERVICE_URL=https://auth-api.inite.ai`

## DNS Configuration Required

⚠️ **IMPORTANT**: Добавь A record в DNS:

```
auth-api.inite.ai  →  [SERVER_IP]
```

Existing:
```
auth.inite.ai      →  [SERVER_IP]  ✅ (already exists)
```

## OAuth Flow Now

1. User clicks "Login" on `break3.inite.health`
2. Frontend redirects to: `https://auth-api.inite.ai/oauth/authorize?...`
3. Backend checks auth:
   - If not authenticated → redirects to `https://auth.inite.ai/login?...`
   - If authenticated → generates code and redirects back
4. User sees login page on `https://auth.inite.ai/login`
5. After login → redirect to `https://break3.inite.health/auth/callback?code=...`

## Benefits

✅ **No routing conflicts** - каждый домен обслуживает только свои запросы
✅ **Simple Traefik rules** - no PathPrefix борщ, no priority issues
✅ **Clear separation** - API vs UI полностью разделены
✅ **Better CORS control** - точно знаем откуда приходят запросы
✅ **Easier debugging** - сразу видно где запрос упал

## Testing

After deployment:

```bash
# Test backend API
curl https://auth-api.inite.ai/health

# Test frontend
curl -I https://auth.inite.ai/login

# Test OAuth authorize
curl -I 'https://auth-api.inite.ai/oauth/authorize?client_id=smart-chat&redirect_uri=https://break3.inite.health/auth/callback&response_type=code&scope=openid'
```

## Rollback

If needed, revert commits:
- `inite-auth-service`: `git revert 3b01c4d`
- `smar-chat`: `git revert 7b46435`
- `smar-chat-backend`: `git revert ef5228e`
- `smar-chat-admin`: `git revert 4a7ca48`


