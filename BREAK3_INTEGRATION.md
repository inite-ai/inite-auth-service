# Break3 Integration with INITE Auth Service

## Problem
Break3 is trying to use `localhost:4000` instead of production URL and getting CORS errors:
```
Fetch API cannot load http://localhost:4000/auth/oauth/token due to access control checks.
```

## Solution

### 1. Configure CORS in Auth Service

Add break3 domain to CORS_ORIGINS in `.env`:

```bash
CORS_ORIGINS=http://localhost:3000,https://break3.inite.health,https://inite.club,https://www.inite.club
```

Or if running locally:
```bash
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:4000,https://break3.inite.health
```

### 2. Register Break3 OAuth Client

Run the registration script:

```bash
cd /Users/mikefluff/Documents/inite-auth-service
npx tsx scripts/register-break3-client.ts
```

This will output CLIENT_ID and CLIENT_SECRET for break3.

### 3. Configure Break3

Update break3's environment variables:

```bash
# Production URL (NOT localhost!)
REACT_APP_AUTH_SERVICE_URL=https://auth.inite.ai
REACT_APP_OAUTH_CLIENT_ID=break3
REACT_APP_OAUTH_CLIENT_SECRET=<secret-from-step-2>

# Or for local development
REACT_APP_AUTH_SERVICE_URL=http://localhost:4000
```

### 4. Restart Auth Service

```bash
npm run start:dev
```

## Verification

1. Break3 should redirect to `https://auth.inite.ai/oauth/authorize` (NOT localhost)
2. No CORS errors in console
3. Token exchange should work

## Common Issues

### Issue: "Not allowed to request resource"
**Solution**: Add break3 domain to CORS_ORIGINS

### Issue: "Invalid client_id"
**Solution**: Register OAuth client using script

### Issue: Still using localhost:4000
**Solution**: Check break3's AUTH_SERVICE_URL env variable

## OAuth Flow

1. User clicks "Login" on break3
2. Redirect to: `https://auth.inite.ai/oauth/authorize?client_id=break3&...`
3. User authenticates (passkey/magic link/password)
4. Redirect back to: `https://break3.inite.health/callback?code=xyz`
5. Break3 exchanges code for tokens via `/oauth/token`
6. Break3 stores tokens and user is logged in

