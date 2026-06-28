# Embedding INITE Auth

Three ways to sign users into your site through the INITE Identity Provider, in order of integration effort.

| Recipe | Effort | Brand control | Best for |
|---|---|---|---|
| [Pure fetch](#1-pure-fetch-15-lines-no-dependency) | 15 lines | Yours | Custom UI, no SDK in bundle |
| [SDK](#2-inite-auth-sdk-5-lines) | 5 lines | Yours | Most apps; React or vanilla |
| [Iframe drop-in](#3-iframe-drop-in-3-lines) | 3 lines | INITE's | Partner sites, fastest path |

## Prerequisite — register your origin

Your domain must be on an INITE OAuth client's `redirectUris` list. This populates the IdP's CORS allowlist **and** the CSP `connect-src` / `frame-ancestors` directives. Without it the browser blocks the cross-origin fetch or iframe before any token logic runs.

Ask an INITE admin to add `https://your-domain.com` (and any others you need) to the relevant client, or do it yourself via the admin panel at `https://auth.inite.ai/admin`.

---

## 1. Pure fetch (15 lines, no dependency)

```html
<form id="login">
  <input name="email" type="email" required />
  <input name="password" type="password" required />
  <button>Sign in</button>
</form>

<script>
  document.getElementById('login').addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const res = await fetch('https://auth.inite.ai/v1/auth/password/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',           // brings the session cookie too
      body: JSON.stringify({
        email: fd.get('email'),
        password: fd.get('password'),
      }),
    })
    if (!res.ok) return alert((await res.json()).message ?? 'failed')
    const { access_token, user } = await res.json()
    sessionStorage.setItem('inite.token', access_token)
    // Use the bearer for your own API:
    // fetch('/your-api', { headers: { Authorization: `Bearer ${access_token}` }})
  })
</script>
```

All public auth endpoints (`/v1/auth/password/login`, `/v1/auth/password/register`, `/v1/auth/email/send-magic-link`, `/v1/auth/passkey/authentication/verify`) return `{ access_token, user }` JSON **and** set a session cookie. Use whichever fits your trust model.

---

## 2. `@inite/auth-sdk` (5 lines)

```bash
npm install @inite/auth-sdk
```

### Vanilla

```ts
import { IniteAuth } from '@inite/auth-sdk'

const auth = new IniteAuth({ clientId: 'your-app-id' })
const { user, accessToken } = await auth.loginWithPassword({ email, password })
auth.onAuthStateChange((session) => render(session))
```

### React

```tsx
import { IniteAuthProvider, useAuth } from '@inite/auth-sdk/react'

function App() {
  return (
    <IniteAuthProvider clientId="your-app-id">
      <Profile />
    </IniteAuthProvider>
  )
}

function Profile() {
  const { user, loading, logout } = useAuth()
  if (loading) return null
  if (!user) return <SignInForm />
  return <button onClick={logout}>Sign out {user.email}</button>
}
```

### Authenticated requests to your API

```ts
const res = await auth.authedFetch('https://your-api/posts', { method: 'POST' })
```

The SDK injects the bearer header automatically and retries once after refreshing from the IdP session cookie on 401.

---

## 3. Iframe drop-in (3 lines)

If you'd rather not implement a sign-in form at all, mount the IdP's own embed:

```html
<div id="auth"></div>
<script type="module">
  import { mountEmbed } from 'https://esm.sh/@inite/auth-sdk'

  const { done } = mountEmbed({
    clientId: 'your-app-id',
    container: document.getElementById('auth'),
  })

  const { user, accessToken } = await done
  // ... use the session
</script>
```

What happens:

1. The SDK creates an `<iframe src="https://auth.inite.ai/embed/login?client_id=…">`.
2. The iframe sends `{ type: 'inite.auth.ready' }` on load; the SDK replies with `{ type: 'inite.handshake' }` so the iframe learns its parent origin.
3. The user signs in (password or magic link). Backend validates as usual.
4. On success the iframe posts `{ type: 'inite.auth.success', accessToken, user }` to the parent — but only to the origin learned in step 2.
5. The SDK resolves the `done` promise.

You can style the iframe container however you like; the embed page is layout-less and inherits page background.

---

## Cookie modes

The IdP issues two session cookies depending on where the request comes from:

| Cookie | SameSite | Set when | Sent to |
|---|---|---|---|
| `inite.sid` | `lax` | Request Origin is empty or equals `FRONTEND_URL` (the IdP frontend itself) | Same-origin only — protects the IdP from CSRF |
| `inite.sid.embed` | `none; Secure` | Request Origin is a registered partner | Cross-origin embedded sessions |

You don't have to manage this — pick the recipe that fits your trust model and the SDK / browser handles cookie selection. If you store the bearer token explicitly (recipes 1 and 2), cookies are belt-and-braces, not required.

---

## What about `client_credentials` for backend-to-backend?

The SDK is browser-only. For server-side M2M auth, mint a JWT directly from `POST /v1/oauth/token` with `grant_type=client_credentials`. There's a Curl recipe pre-generated in the admin panel's OAuth client detail view.
