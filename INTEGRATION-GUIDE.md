# INITE Auth Service Integration Guide

## Для разработчиков фронтенда

Эта инструкция поможет интегрировать ваше приложение с INITE Auth Service для единой авторизации.

## Архитектура

```
┌─────────────────────────────────────────────────────────┐
│  Ваше приложение (Break3, Club, Health, etc.)          │
│                                                         │
│  1. Пользователь нажимает "Войти"                      │
│  2. Редирект на auth.inite.ai с PKCE challenge         │
│  3. Пользователь авторизуется (passkey/email)          │
│  4. Редирект обратно с authorization code              │
│  5. Обмен code на tokens                               │
│  6. Сохранение tokens, доступ к API                    │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
                ┌──────────────────────────┐
                │   auth.inite.ai (IdP)    │
                │                          │
                │  - Passkey (WebAuthn)    │
                │  - Email Magic Link      │
                │  - Password (legacy)     │
                │  - Wallet Connect        │
                │  - DID Management        │
                └──────────────────────────┘
```

## Шаг 1: Получите OAuth2 Credentials

Обратитесь к администратору для регистрации вашего приложения. Вы получите:

- **Client ID**: например, `my-app`, `another-app`
- **Client Secret**: секретный ключ (НЕ храните в коде!)
- **Redirect URIs**: whitelisted URLs для callback

## Шаг 2: Установите зависимости

```bash
npm install crypto-js
```

## Шаг 3: Создайте PKCE helpers

```typescript
// lib/pkce.ts
import CryptoJS from 'crypto-js';

export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

export function generateCodeChallenge(verifier: string): string {
  const hash = CryptoJS.SHA256(verifier);
  return base64URLEncode(hash);
}

function base64URLEncode(data: any): string {
  return CryptoJS.enc.Base64.stringify(data)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}
```

## Шаг 4: Создайте Auth Service

```typescript
// lib/auth-service.ts
import { generateCodeVerifier, generateCodeChallenge, generateState } from './pkce';

const AUTH_DOMAIN = 'https://auth.inite.ai';
const CLIENT_ID = process.env.NEXT_PUBLIC_CLIENT_ID!; // 'my-app'
const CLIENT_SECRET = process.env.CLIENT_SECRET!; // Server-side only!
const REDIRECT_URI = `${window.location.origin}/callback`;

export class AuthService {
  /**
   * Инициировать вход
   */
  static async login() {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();

    // Сохраняем verifier и state в sessionStorage
    sessionStorage.setItem('code_verifier', codeVerifier);
    sessionStorage.setItem('oauth_state', state);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'openid profile email offline_access',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    window.location.href = `${AUTH_DOMAIN}/oauth/authorize?${params}`;
  }

  /**
   * Silent SSO - проверка существующей сессии
   */
  static async checkSession(): Promise<boolean> {
    return new Promise((resolve) => {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);
      const state = generateState();

      sessionStorage.setItem('code_verifier', codeVerifier);
      sessionStorage.setItem('oauth_state', state);

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: `${window.location.origin}/silent-callback`,
        scope: 'openid profile email offline_access',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'none', // Silent SSO!
      });

      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = `${AUTH_DOMAIN}/oauth/authorize?${params}`;

      const timeout = setTimeout(() => {
        cleanup();
        resolve(false);
      }, 5000);

      const cleanup = () => {
        clearTimeout(timeout);
        window.removeEventListener('message', messageHandler);
        document.body.removeChild(iframe);
      };

      const messageHandler = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        cleanup();
        resolve(event.data.success === true);
      };

      window.addEventListener('message', messageHandler);
      document.body.appendChild(iframe);
    });
  }

  /**
   * Обработать callback после авторизации
   */
  static async handleCallback(code: string, state: string): Promise<Tokens> {
    const savedState = sessionStorage.getItem('oauth_state');
    if (state !== savedState) {
      throw new Error('State mismatch - possible CSRF attack');
    }

    const codeVerifier = sessionStorage.getItem('code_verifier');
    if (!codeVerifier) {
      throw new Error('Code verifier not found');
    }

    // Обмен code на tokens (ДОЛЖЕН быть на сервере!)
    const response = await fetch('/api/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!response.ok) {
      throw new Error('Token exchange failed');
    }

    const tokens = await response.json();

    // Очищаем временные данные
    sessionStorage.removeItem('code_verifier');
    sessionStorage.removeItem('oauth_state');

    return tokens;
  }

  /**
   * Обновить access token
   */
  static async refreshToken(refreshToken: string): Promise<Tokens> {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    return await response.json();
  }

  /**
   * Выход
   */
  static async logout() {
    // Отзываем refresh token на сервере
    await fetch('/api/auth/logout', { method: 'POST' });

    // Редирект на logout endpoint IdP
    const params = new URLSearchParams({
      post_logout_redirect_uri: window.location.origin,
    });

    window.location.href = `${AUTH_DOMAIN}/oauth/logout?${params}`;
  }
}

interface Tokens {
  access_token: string;
  refresh_token: string;
  id_token: string;
  expires_in: number;
}
```

## Шаг 5: Создайте Server-side API Routes

**ВАЖНО**: Никогда не отправляйте `client_secret` с клиента!

### Next.js API Route Example

```typescript
// pages/api/auth/token.ts
import type { NextApiRequest, NextApiResponse } from 'next';

const AUTH_DOMAIN = 'https://auth.inite.ai';
const CLIENT_ID = process.env.CLIENT_ID!;
const CLIENT_SECRET = process.env.CLIENT_SECRET!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, code_verifier, redirect_uri } = req.body;

  try {
    const response = await fetch(`${AUTH_DOMAIN}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code_verifier,
      }),
    });

    if (!response.ok) {
      throw new Error('Token exchange failed');
    }

    const tokens = await response.json();

    // Устанавливаем httpOnly cookie для refresh token (безопасно!)
    res.setHeader('Set-Cookie', [
      `refresh_token=${tokens.refresh_token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`,
    ]);

    // Возвращаем только access token и id token
    return res.status(200).json({
      access_token: tokens.access_token,
      id_token: tokens.id_token,
      expires_in: tokens.expires_in,
    });
  } catch (error) {
    console.error('Token exchange error:', error);
    return res.status(500).json({ error: 'Token exchange failed' });
  }
}
```

```typescript
// pages/api/auth/refresh.ts
import type { NextApiRequest, NextApiResponse } from 'next';

const AUTH_DOMAIN = 'https://auth.inite.ai';
const CLIENT_ID = process.env.CLIENT_ID!;
const CLIENT_SECRET = process.env.CLIENT_SECRET!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Получаем refresh token из httpOnly cookie
  const refreshToken = req.cookies.refresh_token;
  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token' });
  }

  try {
    const response = await fetch(`${AUTH_DOMAIN}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const tokens = await response.json();

    // Обновляем refresh token cookie (rotation!)
    res.setHeader('Set-Cookie', [
      `refresh_token=${tokens.refresh_token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`,
    ]);

    return res.status(200).json({
      access_token: tokens.access_token,
      id_token: tokens.id_token,
      expires_in: tokens.expires_in,
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return res.status(500).json({ error: 'Token refresh failed' });
  }
}
```

## Шаг 6: Создайте React компоненты

```typescript
// components/LoginButton.tsx
import { AuthService } from '@/lib/auth-service';

export function LoginButton() {
  return (
    <button onClick={() => AuthService.login()}>
      Войти через INITE
    </button>
  );
}
```

```typescript
// pages/callback.tsx
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { AuthService } from '@/lib/auth-service';

export default function CallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const { code, state, error } = router.query;

    if (error) {
      console.error('OAuth error:', error);
      router.push('/login');
      return;
    }

    if (code && state) {
      AuthService.handleCallback(code as string, state as string)
        .then((tokens) => {
          // Сохраняем access token (можно в память или localStorage)
          localStorage.setItem('access_token', tokens.access_token);
          router.push('/dashboard');
        })
        .catch((error) => {
          console.error('Callback error:', error);
          router.push('/login');
        });
    }
  }, [router.query]);

  return <div>Авторизация...</div>;
}
```

```typescript
// pages/silent-callback.tsx
export default function SilentCallbackPage() {
  useEffect(() => {
    const { code, error } = new URLSearchParams(window.location.search);

    if (error) {
      window.parent.postMessage({ success: false, error }, window.location.origin);
    } else if (code) {
      window.parent.postMessage({ success: true, code }, window.location.origin);
    }
  }, []);

  return null;
}
```

## Шаг 7: Автоматический token refresh

```typescript
// lib/api-client.ts
import { AuthService } from './auth-service';

class APIClient {
  private accessToken: string | null = null;

  async fetch(url: string, options: RequestInit = {}) {
    // Добавляем access token
    const headers = {
      ...options.headers,
      Authorization: `Bearer ${this.accessToken}`,
    };

    let response = await fetch(url, { ...options, headers });

    // Если 401, пробуем обновить token
    if (response.status === 401) {
      try {
        const tokens = await AuthService.refreshToken();
        this.accessToken = tokens.access_token;

        // Повторяем запрос
        headers.Authorization = `Bearer ${this.accessToken}`;
        response = await fetch(url, { ...options, headers });
      } catch (error) {
        // Refresh token истек, нужно заново войти
        AuthService.logout();
        throw new Error('Session expired');
      }
    }

    return response;
  }
}

export const apiClient = new APIClient();
```

## Шаг 8: Проверка сессии при загрузке

```typescript
// pages/_app.tsx
import { useEffect, useState } from 'react';
import { AuthService } from '@/lib/auth-service';

function MyApp({ Component, pageProps }) {
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    // Проверяем сессию при загрузке
    AuthService.checkSession()
      .then((hasSession) => {
        console.log('Has active session:', hasSession);
        setIsCheckingAuth(false);
      })
      .catch(() => setIsCheckingAuth(false));
  }, []);

  if (isCheckingAuth) {
    return <div>Загрузка...</div>;
  }

  return <Component {...pageProps} />;
}

export default MyApp;
```

## ID Token Claims

После успешной авторизации вы получите ID token с следующими claims:

```json
{
  "sub": "did:key:z6Mkf...",  // DID пользователя
  "email": "user@example.com",
  "email_verified": true,
  "name": "John Doe",
  "picture": "https://...",
  "wallets": ["0x123...", "EQC..."],  // Привязанные кошельки
  "roles": ["user", "premium"],
  "entitlements": ["app:read", "app:premium"],
  "iss": "https://auth.inite.ai",
  "aud": "my-app",
  "iat": 1234567890,
  "exp": 1234568490
}
```

## Дополнительные возможности

### Привязка кошелька

```typescript
import { ethers } from 'ethers';

async function linkWallet(accessToken: string) {
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  // Получаем SIWE message
  const nonceResponse = await fetch('https://auth.inite.ai/identity/wallet/siwe-message', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ address, nonce: crypto.randomUUID() }),
  });

  const { message } = await nonceResponse.json();

  // Подписываем
  const signature = await signer.signMessage(message);

  // Отправляем
  await fetch('https://auth.inite.ai/identity/wallet/link', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      address,
      chain: 'ethereum',
      message,
      signature,
    }),
  });
}
```

## Интеграция вертикала (resource server)

Раздел для бэкенд-сервисов экосистемы (brain, inbox, …), которые принимают
access-токены этого IdP. Эталонная интеграция — inite-brain-service.

### 1. Регистрация клиентов

Каждому вертикалу нужны два OAuth-клиента (пример — brain):

| Клиент | Гранты | Audience | Назначение |
|---|---|---|---|
| `brain-landing` | authorization_code + refresh_token + token-exchange | `brain`, `brain-landing` | Дашборд: логин пользователя + обмен его токена на `aud=brain` для проксирования |
| `brain-service` | client_credentials | `brain` | M2M: фоновые задачи без пользователя |

Провижининг: `npm run register-brain-clients` (секреты через
`BRAIN_LANDING_CLIENT_SECRET` / `BRAIN_SERVICE_CLIENT_SECRET`, печатаются один раз).

### 2. Scopes вертикала

Scopes объявлены в `src/oauth/oauth-scopes.registry.ts` и попадают в discovery
(`scopes_supported`). Для brain: `brain:read`, `brain:write`, `brain:admin`,
`brain:read_pii`, `registry:publish`, `indexer:write`. Анонимная динамическая
регистрация (RFC 7591) может запросить только `brain:read` / `brain:write` —
административные scopes выдаются только operator-provisioned клиентам.

### 3. Верификация токенов на ресурс-сервере

- JWT подписаны RS256; ключи — `GET /.well-known/jwks.json` (kid-ротация с перекрытием).
- Проверяйте `iss` (issuer), `aud` (ваш audience, например `brain`), `exp`, подпись.
- Scopes лежат в `scope` (space-delimited) и `scopes` (массив).
- Непрозрачные credentials (API-ключи) проверяйте через `POST /v1/oauth/introspect`.

### 4. Claims для мультитенантности

При включённом `RBAC_TOKEN_CLAIMS_ENABLED` пользовательские access-токены несут
`org` (companyId организации) и `org_id` (UUID). Правило для вертикала:

- есть `org` → тенант = `org`, пользователь = `sub` (did:key);
- нет `org` (M2M client_credentials) → тенант = `sub` (companyId клиента).

### 5. Токен пользователя вместо M2M (token exchange, RFC 8693)

BFF вертикала не должен минтить анонимный client_credentials-токен для
проксирования пользовательских запросов — обменивайте токен сессии:

```bash
curl -X POST https://auth.inite.ai/v1/oauth/token \
  -d grant_type=urn:ietf:params:oauth:grant-type:token-exchange \
  -d client_id=brain-landing -d client_secret=$SECRET \
  -d subject_token=$USER_ACCESS_TOKEN \
  -d subject_token_type=urn:ietf:params:oauth:token-type:access_token \
  -d audience=brain -d scope="brain:read brain:write"
```

Выданный токен сохраняет `sub` пользователя, несёт `act` (кто действует от его
имени) и `org`/`org_id`, а scope может только сужаться.

### 6. Пер-инструментные права агентов (RAR, RFC 9396)

При включённом `RAR_ENABLED` клиент может передать в `/authorize` (и через
consent-экран) `authorization_details` типа `inite_mcp_resource`:

```json
[{ "type": "inite_mcp_resource",
   "locations": ["https://brain.inite.ai"],
   "actions": ["search_knowledge", "record_fact"] }]
```

Гранты показываются пользователю на consent-экране человекочитаемым списком,
персистятся на code/refresh, попадают claim'ом в access-токен и переживают
token exchange. Вертикал (brain) снимает с регистрации MCP-тулзы вне
гранта; `actions` — имена action-реестра вертикала, `read`/`write` — макросы
на целый класс. Fail-closed: грант с чужим `locations` даёт пустую поверхность.

### 7. Политики для агентов (claims `policy`/`packs`)

Два канала доставки ABAC-политик вертикала:

- **OAuthClient.customClaims** (admin → OAuth Clients → Edit): map вида
  `{"policy": ["support-reader"], "packs": ["real_estate"]}` — санитизируется
  (только эти ключи, identifier-чарсет) и стемпится на каждый токен клиента
  (user-flow, client_credentials, token exchange). Так политика пинуется к
  агенту как к OAuth-клиенту.
- **ApiKey.policyNames** (admin → API Keys → New key): для долгоживущих
  `ik_…` ключей; уезжает членом `policy` в ответе introspection.

Brain дополнительно поддерживает биндинг `agent:<client_id>` на своей
стороне (policy_binding) — политика на действующего агента без правок в auth.

## Troubleshooting

### CORS errors
Убедитесь, что ваш домен добавлен в `CORS_ORIGINS` в настройках Auth Service.

### State mismatch
Убедитесь, что `state` сохраняется и проверяется правильно для защиты от CSRF.

### Token refresh fails
Проверьте, что refresh token хранится в httpOnly cookie и не истек.

### Silent SSO не работает
Убедитесь, что cookies разрешены и работает iframe communication.

## Поддержка

- Issues: https://github.com/inite-ai/inite-auth-service/issues
- Документация: см. [QUICK-START.md](QUICK-START.md), [README.md](README.md), [ENV-SETUP.md](ENV-SETUP.md)





