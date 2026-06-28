# INITE Auth Service — Quick Start

Run the identity provider locally in a few minutes.

## Prerequisites

- Docker + Docker Compose
- (For non-Docker dev) Node.js 22+, PostgreSQL 15+, Redis 7+

## 1. Clone and configure

```bash
git clone https://github.com/inite-ai/inite-auth-service.git
cd inite-auth-service

# Create your .env from the template, then fill in secrets
cp .env.example .env
$EDITOR .env
```

Generate the required secrets:

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32)"
echo "REDIS_PASSWORD=$(openssl rand -base64 32)"
echo "JWT_SECRET=$(openssl rand -base64 64)"
echo "REFRESH_TOKEN_HMAC_SECRET=$(openssl rand -base64 64)"
```

For production use RS256 (JWKS) instead of the HS256 `JWT_SECRET` — see
[ENV-SETUP.md](ENV-SETUP.md).

## 2. Start

```bash
# Helper script: brings up containers + runs migrations
./start.sh

# ...or manually:
docker compose up -d
docker compose exec -T auth-service npm run prisma:migrate:deploy
```

## 3. Create an admin and register a client

```bash
# Admin user (password is required, no default)
ADMIN_PASSWORD=$(openssl rand -base64 24) \
  docker compose exec -T auth-service npm run create-admin

# OAuth client — edit scripts/register-client.example.ts for your app first
docker compose exec -T auth-service npm run register-client
```

## 4. Verify

```bash
curl http://localhost:3002/health
curl http://localhost:3002/.well-known/openid-configuration
docker compose logs -f auth-service
```

## 5. Try an authorization request

Open in a browser (replace `client_id` with the one you registered):

```
http://localhost:3002/v1/oauth/authorize?response_type=code&client_id=my-app&redirect_uri=http://localhost:3000/callback&scope=openid%20profile%20email&state=test123&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256
```

PKCE is mandatory and only the `S256` method is accepted.

## Frontend integration

See [INTEGRATION-GUIDE.md](INTEGRATION-GUIDE.md) for a full PKCE login example.
Minimal sketch (replace `https://auth.example.com` with your deployment):

```typescript
// 1. Start login
const login = () => {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  localStorage.setItem('code_verifier', codeVerifier);

  window.location.href =
    `https://auth.example.com/v1/oauth/authorize?response_type=code` +
    `&client_id=my-app` +
    `&redirect_uri=${window.location.origin}/callback` +
    `&scope=openid profile email` +
    `&code_challenge=${codeChallenge}&code_challenge_method=S256`;
};

// 2. Handle callback — exchange code (+ verifier) for tokens
const handleCallback = async (code: string) => {
  const codeVerifier = localStorage.getItem('code_verifier');
  const res = await fetch('https://auth.example.com/v1/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: 'my-app',
      code,
      code_verifier: codeVerifier,
      redirect_uri: `${window.location.origin}/callback`,
    }),
  });
  const { access_token } = await res.json();
  // use access_token for API calls
};
```

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Container won't start | `docker compose logs auth-service`; `docker compose config` |
| DB connection failed | `docker compose ps`; verify `DATABASE_URL` / `DB_*` in `.env` |
| Token exchange fails | client_id/secret correct, redirect_uri matches exactly, verifier ↔ challenge |

## More docs

- [README.md](README.md) — overview & architecture
- [ENV-SETUP.md](ENV-SETUP.md) — full environment / secrets reference
- [ADMIN-SETUP.md](ADMIN-SETUP.md) — admin panel & operations
- [SECURITY.md](SECURITY.md) — security model & disclosure
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to contribute
