'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { authStorage } from '@/lib/authStorage'
import { AppHeader } from '@/components/AppHeader'
import { META } from '@/lib/brand'

/**
 * Interactive chrome of the landing: header, hero and the sign-in-aware CTA.
 *
 * Static sections arrive as `children` and stay server components, so the
 * marketing copy is in the served HTML rather than behind hydration.
 *
 * The `client_id` hand-off deliberately reads `window.location.search` in an
 * effect instead of `useSearchParams()`. The hook is a dynamic API: under
 * static prerendering it bails the enclosing Suspense boundary, which is what
 * previously reduced this page to a five-word shell for every crawler. The
 * redirect only ever runs on the client, so the effect is the honest place
 * for it and the page keeps its static prerender.
 */
export function LandingShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('client_id')) {
      router.push(`/login?${params.toString()}`)
      return
    }
    if (authStorage.getValidToken()) setAuthenticated(true)
  }, [router])

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <AppHeader
        hideUserMenu={!authenticated}
        user={
          authenticated
            ? { id: '', email: 'You', metadata: { isAdmin: false } }
            : undefined
        }
      />

      <main className="max-w-5xl mx-auto px-6">
        <section className="pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-[11px] text-[var(--text-muted)] mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--success)]" />
            Identity Provider · v1.1
          </div>

          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-[var(--text)] leading-[1.05]">
            {META.ogTitle}
          </h1>
          <p className="mt-5 max-w-xl mx-auto text-[15px] leading-relaxed text-[var(--text-muted)]">
            INITE is an OAuth 2.0 / OIDC provider with passkeys, magic links,
            password fallback, Web3 wallet linking, and a service-token surface
            for backend-to-backend auth. Drop the SDK into your app, embed the
            iframe, or wire AI assistants in via MCP — no redirects required.
          </p>

          <div className="mt-8 flex items-center justify-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => router.push(authenticated ? '/account' : '/register')}
              className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)]"
            >
              {authenticated ? 'Open account' : 'Create identity'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <a
              href="/.well-known/openid-configuration"
              target="_blank"
              rel="noopener noreferrer"
              className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded-md border border-[var(--border-strong)] text-[var(--text)] text-sm font-medium hover:bg-[var(--bg-overlay)]"
            >
              OIDC discovery
            </a>
            <Link
              href="/login"
              className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded-md text-[var(--text-muted)] text-sm hover:text-[var(--text)] hover:bg-[var(--bg-overlay)]"
            >
              Sign in
            </Link>
          </div>

          <div className="mt-12 accent-underline" />
        </section>

        {children}
      </main>
    </div>
  )
}
