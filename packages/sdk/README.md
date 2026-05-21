# @inite/auth-sdk

Browser SDK for the INITE Identity Provider.

## Install

```bash
npm install @inite/auth-sdk
```

## Quick start (vanilla)

```ts
import { IniteAuth } from '@inite/auth-sdk'

const auth = new IniteAuth({
  clientId: 'your-app-id',
  // baseUrl defaults to https://auth.inite.ai
  // storage: 'session' to persist across reloads (default 'memory')
})

const { user, accessToken } = await auth.loginWithPassword({
  email: 'user@example.com',
  password: '••••',
})

auth.onAuthStateChange((session) => {
  console.log(session) // { user, accessToken } | null
})
```

## React

```tsx
import { IniteAuthProvider, useAuth } from '@inite/auth-sdk/react'

function App() {
  return (
    <IniteAuthProvider clientId="your-app-id">
      <SignInBox />
    </IniteAuthProvider>
  )
}

function SignInBox() {
  const { user, loginWithPassword, logout, loading } = useAuth()
  if (loading) return null
  if (user) return <button onClick={() => logout()}>Sign out {user.email}</button>
  return <button onClick={() => loginWithPassword({ email, password })}>Sign in</button>
}
```

## Iframe drop-in

For sites that don't want to build their own UI:

```ts
import { mountEmbed } from '@inite/auth-sdk'

const container = document.getElementById('login')!
const { done, destroy } = mountEmbed({
  clientId: 'your-app-id',
  container,
})

const session = await done
console.log(session.user)
destroy() // remove the iframe
```

## Authenticated requests

The SDK exposes `authedFetch` that injects the bearer token and refreshes once on 401:

```ts
const res = await auth.authedFetch('https://your-api/posts', { method: 'POST' })
```

## Prerequisite

Your domain must be registered as a `redirectUri` on the OAuth client so the IdP's CORS allowlist and CSP `connect-src` include it. Without that the cross-origin requests are blocked at the browser layer regardless of correct token handling.
