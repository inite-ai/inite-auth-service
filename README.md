# INITE Identity Provider (IdP)

![Build](https://img.shields.io/badge/build-passing-brightgreen)
![Deploy](https://img.shields.io/badge/deploy-automated-blue)
![Version](https://img.shields.io/badge/version-1.0.0-blue)

Unified authentication and identity management service for the INITE ecosystem.

## 🚀 Quick Deploy

```bash
# Push to main branch triggers automatic deployment
git push origin main

# Or deploy manually via GitHub Actions UI
# Actions → Deploy to Production → Run workflow
```

## Overview

This service provides centralized authentication for all INITE modules:
- **break3** (inite.health)
- **club** (inite.club)
- **health** (inite.health)
- **events** (inite.events)
- **estate** (inite.estate)
- **education** (inite.education)

## Key Features

### 🔐 Authentication Methods
- **Passkey (WebAuthn)** - Primary authentication method
- **Email Magic Link** - Passwordless fallback
- **Email/Password** - Traditional authentication
- **Wallet Connect** - Optional Web3 wallet linking (not required for login)

### 🆔 Web3-Native Identity
- **DID (Decentralized Identifiers)** - User identity based on DID, not email
- **Verifiable Credentials** - Issue and verify claims
- **Wallet Binding** - Link multiple wallets to single identity via SIWE
- **Portable Identity** - User owns their identity and proofs

### 🔄 OAuth2/OIDC Flow
- Authorization Code flow with PKCE
- Silent SSO with `prompt=none`
- Short-lived access tokens (5-10 minutes)
- Rotating refresh tokens (secure, server-side storage)
- Standard OIDC discovery endpoint

### 🏢 Multi-Tenancy
- Support for multiple client applications
- Per-module configuration and branding
- Centralized user management
- Cross-module SSO

### 🛡️ Security
- Passkey-first authentication
- PKCE for OAuth2 flows
- Token rotation
- Rate limiting
- Audit logging
- 2FA support

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   break3     │     │    club      │     │   health     │
│ inite.health │     │  inite.club  │     │ inite.health │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │   Auth Service   │
                  │  auth.inite.ai   │
                  └────────┬─────────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
            ▼              ▼              ▼
      ┌──────────┐   ┌──────────┐   ┌──────────┐
      │PostgreSQL│   │  Redis   │   │  Email   │
      └──────────┘   └──────────┘   └──────────┘
```

## OAuth2/OIDC Flow

### 1. Authorization Request
```
GET https://auth.inite.ai/oauth/authorize
  ?response_type=code
  &client_id=break3
  &redirect_uri=https://break3.inite.health/callback
  &scope=openid profile email
  &state=xyz
  &code_challenge=abc
  &code_challenge_method=S256
  &prompt=none  // For silent SSO
```

### 2. User Authentication
- If `prompt=none` and session exists → auto-authorize
- If no session → show login (passkey/email link)
- User authenticates with preferred method

### 3. Authorization Response
```
302 https://break3.inite.health/callback
  ?code=authorization_code
  &state=xyz
```

### 4. Token Exchange
```
POST https://auth.inite.ai/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=authorization_code
&redirect_uri=https://break3.inite.health/callback
&client_id=break3
&code_verifier=verifier
```

### 5. Token Response
```json
{
  "access_token": "eyJhbGc...",
  "refresh_token": "rt_abc...",
  "id_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 600
}
```

### 6. Token Claims
```json
{
  "sub": "did:key:z6Mkf...",
  "email": "user@example.com",
  "email_verified": true,
  "name": "John Doe",
  "roles": ["user", "premium"],
  "wallets": ["0x123...", "EQC..."],
  "entitlements": ["break3:read", "club:premium"],
  "iss": "https://auth.inite.ai",
  "aud": "break3",
  "iat": 1234567890,
  "exp": 1234568490
}
```

## DID Integration

Each user gets a DID (Decentralized Identifier):

```json
{
  "did": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  "publicKey": "z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  "created": "2024-01-15T10:00:00Z"
}
```

Wallets are linked via SIWE (Sign-In With Ethereum):

```typescript
// User signs message with wallet
const message = `auth.inite.ai wants you to sign in with your Ethereum account:
${walletAddress}

Link this wallet to DID: ${userDid}
Nonce: ${nonce}
Issued At: ${issuedAt}`;

// Signature is verified and wallet is bound to DID
```

## API Endpoints

### OAuth2/OIDC
- `GET /.well-known/openid-configuration` - OIDC discovery
- `GET /.well-known/jwks.json` - Public keys
- `GET /oauth/authorize` - Authorization endpoint
- `POST /oauth/token` - Token endpoint
- `GET /oauth/userinfo` - User info endpoint
- `POST /oauth/revoke` - Token revocation

### Authentication
- `POST /auth/passkey/register` - Register passkey
- `POST /auth/passkey/authenticate` - Authenticate with passkey
- `POST /auth/email/send-magic-link` - Send magic link
- `POST /auth/email/verify-magic-link` - Verify magic link
- `POST /auth/password/login` - Password login
- `POST /auth/password/register` - Password registration

### Identity Management
- `GET /identity/me` - Get current user identity
- `GET /identity/did` - Get user DID
- `POST /identity/wallet/link` - Link wallet (SIWE)
- `DELETE /identity/wallet/:address` - Unlink wallet
- `GET /identity/credentials` - Get verifiable credentials
- `POST /identity/credentials` - Issue credential

### Session Management
- `POST /session/refresh` - Refresh tokens
- `POST /session/logout` - Logout
- `GET /session/active` - List active sessions
- `DELETE /session/:id` - Revoke session

## Database Schema

### Users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  did VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  email_verified BOOLEAN DEFAULT FALSE,
  name VARCHAR(255),
  avatar_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Passkeys (WebAuthn Credentials)
```sql
CREATE TABLE passkeys (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  credential_id TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  counter BIGINT DEFAULT 0,
  device_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP
);
```

### Wallets
```sql
CREATE TABLE wallets (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  address VARCHAR(255) UNIQUE NOT NULL,
  chain VARCHAR(50) NOT NULL,
  linked_at TIMESTAMP DEFAULT NOW(),
  signature TEXT NOT NULL
);
```

### OAuth Clients
```sql
CREATE TABLE oauth_clients (
  id UUID PRIMARY KEY,
  client_id VARCHAR(255) UNIQUE NOT NULL,
  client_secret_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  redirect_uris TEXT[] NOT NULL,
  allowed_grants TEXT[] DEFAULT ARRAY['authorization_code', 'refresh_token'],
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Authorization Codes
```sql
CREATE TABLE authorization_codes (
  id UUID PRIMARY KEY,
  code VARCHAR(255) UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id),
  client_id VARCHAR(255) REFERENCES oauth_clients(client_id),
  redirect_uri TEXT NOT NULL,
  scope TEXT,
  code_challenge VARCHAR(255),
  code_challenge_method VARCHAR(10),
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE
);
```

### Refresh Tokens
```sql
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY,
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id),
  client_id VARCHAR(255) REFERENCES oauth_clients(client_id),
  scope TEXT,
  expires_at TIMESTAMP NOT NULL,
  rotated_from UUID REFERENCES refresh_tokens(id),
  revoked BOOLEAN DEFAULT FALSE
);
```

## Environment Setup

1. Copy `.env.example` to `.env`
2. Configure database, Redis, and SMTP
3. Generate JWT secret: `openssl rand -base64 32`
4. Register OAuth2 clients
5. Configure CORS origins

## Development

```bash
# Install dependencies
npm install

# Run migrations
npm run migration:run

# Start development server
npm run start:dev
```

## Production Deployment

```bash
# Build
npm run build

# Run migrations
npm run migration:run

# Start production server
npm run start:prod
```

## Docker

```bash
# Build image
docker build -t inite-auth-service:latest .

# Run container
docker run -p 3002:3002 \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  inite-auth-service:latest
```

## Client Integration

### React Example

```typescript
import { useEffect } from 'react';

// Silent SSO check on app load
useEffect(() => {
  const checkAuth = async () => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    
    localStorage.setItem('code_verifier', codeVerifier);
    
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: 'break3',
      redirect_uri: `${window.location.origin}/callback`,
      scope: 'openid profile email',
      state: generateState(),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'none' // Silent SSO
    });
    
    window.location.href = `https://auth.inite.ai/oauth/authorize?${params}`;
  };
  
  checkAuth();
}, []);

// Handle callback
const handleCallback = async (code: string) => {
  const codeVerifier = localStorage.getItem('code_verifier');
  
  const response = await fetch('https://auth.inite.ai/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${window.location.origin}/callback`,
      client_id: 'break3',
      code_verifier: codeVerifier
    })
  });
  
  const tokens = await response.json();
  // Store tokens securely (preferably server-side)
  localStorage.setItem('access_token', tokens.access_token);
  localStorage.setItem('refresh_token', tokens.refresh_token);
};
```

## Web3 Integration

### Link Wallet

```typescript
import { SiweMessage } from 'siwe';

const linkWallet = async (walletAddress: string, signer: Signer) => {
  // Get current user's DID
  const { did } = await fetch('https://auth.inite.ai/identity/did', {
    headers: { Authorization: `Bearer ${accessToken}` }
  }).then(r => r.json());
  
  // Create SIWE message
  const message = new SiweMessage({
    domain: 'auth.inite.ai',
    address: walletAddress,
    statement: `Link this wallet to DID: ${did}`,
    uri: 'https://auth.inite.ai',
    version: '1',
    chainId: 1
  });
  
  // Sign message
  const signature = await signer.signMessage(message.prepareMessage());
  
  // Send to backend
  await fetch('https://auth.inite.ai/identity/wallet/link', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      address: walletAddress,
      message: message.prepareMessage(),
      signature
    })
  });
};
```

## Security Considerations

1. **PKCE Required** - All authorization flows must use PKCE
2. **Short Access Tokens** - Access tokens expire in 5-10 minutes
3. **Rotating Refresh Tokens** - New refresh token on each use
4. **Passkey First** - Encourage passkey over password
5. **Rate Limiting** - Protect against brute force
6. **HTTPS Only** - All endpoints require HTTPS in production
7. **CORS Strict** - Only whitelisted origins allowed
8. **Token Storage** - Refresh tokens stored server-side only

## Migration from Existing Auth

1. Export users from old system
2. Generate DIDs for existing users
3. Import with preserved IDs
4. Notify users to set up passkey
5. Deprecate old auth system

## Monitoring

- Health check: `GET /health`
- Metrics: `GET /metrics` (Prometheus format)
- Logs: JSON structured logging
- Alerts: Failed authentications, token abuse

## Support

- Documentation: https://docs.inite.ai/auth
- Issues: https://github.com/inite/auth-service/issues
- Email: support@inite.ai

