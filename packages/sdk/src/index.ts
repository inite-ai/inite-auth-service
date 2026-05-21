export interface IniteAuthUser {
  id: string
  did?: string
  email: string
  name?: string
}

export interface IniteAuthSession {
  user: IniteAuthUser
  accessToken: string
}

export interface IniteAuthOptions {
  /** OAuth client id registered with INITE. Required. */
  clientId: string
  /** Base URL of the IdP. Default: https://auth.inite.ai */
  baseUrl?: string
  /**
   * Where to persist the access token between page loads.
   * - 'memory' (default): forgotten on reload. Most secure against XSS.
   * - 'session': sessionStorage. Survives reload, dies with tab.
   * - 'local': localStorage. Survives tab close. Use only if the
   *   site has no third-party scripts.
   */
  storage?: 'memory' | 'session' | 'local'
  /** Override `fetch` for testing / SSR shims. */
  fetch?: typeof fetch
}

type Listener = (session: IniteAuthSession | null) => void

const STORAGE_KEY = 'inite.auth.session'

function getStorage(kind: IniteAuthOptions['storage']): Storage | null {
  if (typeof window === 'undefined') return null
  if (kind === 'session') return window.sessionStorage
  if (kind === 'local') return window.localStorage
  return null
}

/**
 * Headless auth client for the INITE Identity Provider.
 *
 * Wraps the same JSON endpoints the first-party frontend uses, with
 * `credentials: 'include'` so the IdP session cookie flows alongside
 * the JWT — either is sufficient depending on cross-origin setup.
 *
 * Subscribe with onAuthStateChange to keep UI in sync; the SDK
 * emits on login, logout, and (when storage is non-memory) on the
 * initial hydration from storage.
 */
export class IniteAuth {
  private readonly clientId: string
  private readonly baseUrl: string
  private readonly storage: Storage | null
  private readonly fetchImpl: typeof fetch
  private session: IniteAuthSession | null = null
  private readonly listeners = new Set<Listener>()

  constructor(opts: IniteAuthOptions) {
    if (!opts?.clientId) {
      throw new Error('IniteAuth: clientId is required')
    }
    this.clientId = opts.clientId
    this.baseUrl = (opts.baseUrl ?? 'https://auth.inite.ai').replace(/\/$/, '')
    this.storage = getStorage(opts.storage)
    this.fetchImpl = opts.fetch ?? (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch)

    if (this.storage) {
      try {
        const raw = this.storage.getItem(STORAGE_KEY)
        if (raw) this.session = JSON.parse(raw) as IniteAuthSession
      } catch {
        /* ignored */
      }
    }
  }

  /** Current cached session (sync, no I/O). */
  getSessionSync(): IniteAuthSession | null {
    return this.session
  }

  /**
   * Fresh session check against the IdP. Resolves null if not signed
   * in. Useful for hydrating UI after a magic-link callback that
   * landed on a different tab.
   */
  async getSession(): Promise<IniteAuthSession | null> {
    const res = await this.fetchImpl(this.url('/v1/auth/session/me'), {
      credentials: 'include',
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      authenticated?: boolean
      access_token?: string
      user?: IniteAuthUser
    }
    if (!data?.authenticated || !data.access_token || !data.user) {
      this.setSession(null)
      return null
    }
    const session: IniteAuthSession = {
      user: data.user,
      accessToken: data.access_token,
    }
    this.setSession(session)
    return session
  }

  async loginWithPassword(input: {
    email: string
    password: string
  }): Promise<IniteAuthSession> {
    const data = await this.postJson<{
      access_token: string
      user: IniteAuthUser
    }>('/v1/auth/password/login', input)
    const session: IniteAuthSession = {
      user: data.user,
      accessToken: data.access_token,
    }
    this.setSession(session)
    return session
  }

  async registerWithPassword(input: {
    email: string
    password: string
    name?: string
  }): Promise<IniteAuthSession> {
    const data = await this.postJson<{
      access_token: string
      user: IniteAuthUser
    }>('/v1/auth/password/register', input)
    const session: IniteAuthSession = {
      user: data.user,
      accessToken: data.access_token,
    }
    this.setSession(session)
    return session
  }

  /**
   * Send a magic link to the given email. The link, when clicked,
   * lands the user back on the IdP, which then redirects to the
   * registered redirect_uri for clientId. There is no session
   * returned from this call — call getSession() later.
   */
  async sendMagicLink(input: { email: string }): Promise<void> {
    await this.postJson('/v1/auth/email/send-magic-link', {
      email: input.email,
      clientId: this.clientId,
    })
  }

  async logout(): Promise<void> {
    try {
      await this.fetchImpl(this.url('/v1/oauth/logout'), {
        method: 'GET',
        credentials: 'include',
      })
    } catch {
      /* best-effort */
    }
    this.setSession(null)
  }

  /**
   * Subscribe to auth-state changes. Returns an unsubscribe function.
   * Fires immediately with the current state so subscribers can
   * initialize without a separate read.
   */
  onAuthStateChange(listener: Listener): () => void {
    this.listeners.add(listener)
    queueMicrotask(() => listener(this.session))
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Build an authenticated fetch wrapper that injects the current
   * bearer token. Re-fetches on 401 once after refreshing the session
   * from the IdP cookie — handles the common case where the JWT has
   * expired but the session cookie is still valid.
   */
  async authedFetch(
    input: RequestInfo | URL,
    init: RequestInit = {},
  ): Promise<Response> {
    const exec = async (token: string | null) => {
      const headers = new Headers(init.headers)
      if (token) headers.set('Authorization', `Bearer ${token}`)
      return this.fetchImpl(input, {
        ...init,
        headers,
        credentials: init.credentials ?? 'include',
      })
    }

    const token = this.session?.accessToken ?? null
    let response = await exec(token)
    if (response.status === 401 && this.session) {
      const refreshed = await this.getSession().catch(() => null)
      if (refreshed) {
        response = await exec(refreshed.accessToken)
      }
    }
    return response
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchImpl(this.url(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const detail = await res.json().catch(() => ({})) as {
        message?: string
        error?: string
      }
      const err = new Error(
        detail.message ?? detail.error ?? `Request failed (${res.status})`,
      ) as Error & { status: number; body: unknown }
      err.status = res.status
      err.body = detail
      throw err
    }
    return (await res.json()) as T
  }

  private setSession(session: IniteAuthSession | null): void {
    this.session = session
    if (this.storage) {
      try {
        if (session) {
          this.storage.setItem(STORAGE_KEY, JSON.stringify(session))
        } else {
          this.storage.removeItem(STORAGE_KEY)
        }
      } catch {
        /* quota or privacy mode */
      }
    }
    for (const listener of this.listeners) {
      try {
        listener(session)
      } catch {
        /* listener errors must not affect each other */
      }
    }
  }

  private url(path: string): string {
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  }
}

/**
 * Convenience: open the IdP's hosted iframe and resolve when the
 * user has signed in via postMessage. Returns the resulting session.
 *
 * Caller is responsible for placing the returned iframe into the DOM;
 * we just give back the element and the promise so the caller can
 * style/size it however they want.
 */
export interface MountEmbedOptions {
  clientId: string
  baseUrl?: string
  container?: HTMLElement
}

export interface MountEmbedResult {
  iframe: HTMLIFrameElement
  done: Promise<IniteAuthSession>
  destroy: () => void
}

export function mountEmbed(opts: MountEmbedOptions): MountEmbedResult {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('mountEmbed requires a browser environment')
  }
  const baseUrl = (opts.baseUrl ?? 'https://auth.inite.ai').replace(/\/$/, '')

  const iframe = document.createElement('iframe')
  iframe.src = `${baseUrl}/embed/login?client_id=${encodeURIComponent(opts.clientId)}`
  iframe.style.border = '0'
  iframe.style.width = '100%'
  iframe.style.minHeight = '360px'
  iframe.setAttribute('allow', 'publickey-credentials-get *; publickey-credentials-create *')

  if (opts.container) opts.container.appendChild(iframe)

  let cleanup = () => {
    /* set below */
  }

  const done = new Promise<IniteAuthSession>((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      // Only accept messages from the IdP origin.
      try {
        if (new URL(baseUrl).origin !== event.origin) return
      } catch {
        return
      }
      if (typeof event.data !== 'object' || event.data == null) return

      if (event.data.type === 'inite.auth.ready') {
        // Handshake back so the embed page learns our origin.
        iframe.contentWindow?.postMessage(
          { type: 'inite.handshake' },
          new URL(baseUrl).origin,
        )
        return
      }
      if (event.data.type === 'inite.auth.success' && event.data.accessToken) {
        cleanup()
        resolve({
          user: event.data.user,
          accessToken: event.data.accessToken,
        })
        return
      }
      if (event.data.type === 'inite.auth.error') {
        cleanup()
        reject(new Error(event.data.error ?? 'auth_failed'))
      }
    }
    window.addEventListener('message', onMessage)
    cleanup = () => {
      window.removeEventListener('message', onMessage)
      iframe.remove()
    }
  })

  return { iframe, done, destroy: () => cleanup() }
}
