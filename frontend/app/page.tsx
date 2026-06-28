'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Shield,
  Key,
  Fingerprint,
  Wallet,
  ArrowRight,
  Server,
  Lock,
  Mail,
  CheckCircle2,
  Bot,
} from 'lucide-react'
import { authStorage } from '@/lib/authStorage'
import { AppHeader } from '@/components/AppHeader'

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    const clientId = searchParams.get('client_id')
    if (clientId) {
      const params = new URLSearchParams(searchParams.toString())
      router.push(`/login?${params.toString()}`)
      return
    }
    if (authStorage.getValidToken()) {
      setAuthenticated(true)
    }
  }, [searchParams, router])

  const features = [
    {
      icon: Fingerprint,
      title: 'Passkeys',
      desc: 'Phishing-resistant sign-in with Touch ID, Face ID, Windows Hello, or a hardware key.',
    },
    {
      icon: Shield,
      title: 'OAuth 2.0 / OIDC',
      desc: 'Standards-compliant authorization code + PKCE, refresh rotation, PAR, DPoP, back-channel logout.',
    },
    {
      icon: Server,
      title: 'Service tokens',
      desc: 'client_credentials grant with audience binding and scoped JWTs — fleet-safe M2M auth.',
    },
    {
      icon: Mail,
      title: 'Magic links',
      desc: 'Passwordless email sign-in with rate limiting, replay protection, and HIBP-checked fallbacks.',
    },
    {
      icon: Wallet,
      title: 'Web3 wallets',
      desc: 'Ethereum, Polygon, and TON linked via signed challenges — keep your crypto identity portable.',
    },
    {
      icon: Key,
      title: 'DID identity',
      desc: 'Every user gets a did:key — portable across the INITE ecosystem and out of it.',
    },
    {
      icon: Bot,
      title: 'AI-ready (MCP)',
      desc: 'Six auth-admin tools and three skills shipped via @inite/auth-admin — Claude Desktop, Cursor, Goose, n8n provision clients and respond to incidents through MCP.',
    },
  ]

  const checklist = [
    'Account lockout with exponential backoff',
    'HIBP breached-password rejection',
    'Per-IP credential-stuffing defence',
    'Audit log surfaced to users and admins',
    'Embed-ready: CORS + CSP per partner',
    'Self-hostable, OSS license',
  ]

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
        {/* Hero */}
        <section className="pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-[11px] text-[var(--text-muted)] mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--success)]" />
            Identity Provider · v1.1
          </div>

          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-[var(--text)] leading-[1.05]">
            Identity that fits your stack.
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

        {/* Features grid */}
        <section className="py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {features.map((f) => {
              const Icon = f.icon
              return (
                <div
                  key={f.title}
                  className="p-5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)] transition-colors"
                >
                  <div className="w-8 h-8 rounded-md bg-[var(--bg-overlay)] border border-[var(--border)] flex items-center justify-center text-[var(--accent)] mb-3">
                    <Icon className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--text)] tracking-tight">
                    {f.title}
                  </h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
                    {f.desc}
                  </p>
                </div>
              )
            })}
          </div>
        </section>

        {/* What's in the box */}
        <section className="py-12 border-t border-[var(--border)] grid md:grid-cols-2 gap-10">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)] tracking-tight">
              Security defaults that don&apos;t need a security team.
            </h2>
            <p className="mt-2 text-sm text-[var(--text-muted)] leading-relaxed">
              Every primitive is on by default — you opt out of hardening, not
              into it. Audit log is queryable by both end users and operators.
            </p>
          </div>
          <ul className="space-y-2.5">
            {checklist.map((line) => (
              <li
                key={line}
                className="flex items-start gap-2 text-sm text-[var(--text)]"
              >
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-[color:var(--success)] shrink-0" />
                {line}
              </li>
            ))}
          </ul>
        </section>

        {/* Embed snippet */}
        <section className="py-12 border-t border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text)] tracking-tight">
            Embed in five lines.
          </h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Headless SDK + drop-in iframe widget. CORS and CSP auto-allow
            registered partner origins.
          </p>
          <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] overflow-hidden">
            <div className="px-3 py-2 border-b border-[var(--border)] text-[11px] font-mono text-[var(--text-faint)]">
              @inite/auth-sdk
            </div>
            <pre className="px-4 py-4 text-[12px] leading-relaxed font-mono text-[var(--text)] overflow-x-auto">{`import { IniteAuth } from '@inite/auth-sdk'

const auth = new IniteAuth({ clientId: 'your-app-id' })
const { user, accessToken } = await auth.loginWithPassword({
  email, password,
})`}</pre>
          </div>
        </section>

        {/* MCP snippet */}
        <section className="py-12 border-t border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text)] tracking-tight">
            AI assistants ship as a peer dependency.
          </h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Two lines in your vertical&apos;s bootstrap exposes provisioning,
            rotation, audit and revoke through every MCP client. Per-tenant
            role gates layer on top of OAuth scope.
          </p>
          <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] overflow-hidden">
            <div className="px-3 py-2 border-b border-[var(--border)] text-[11px] font-mono text-[var(--text-faint)]">
              @inite/auth-admin
            </div>
            <pre className="px-4 py-4 text-[12px] leading-relaxed font-mono text-[var(--text)] overflow-x-auto">{`import { registerAuthAdminTool, authAdminSkills } from '@inite/auth-admin'
import { registerSkill } from '@inite/skills'

registerAuthAdminTool()
for (const s of authAdminSkills) registerSkill(s)`}</pre>
          </div>
          <div className="mt-4">
            <Link
              href="/docs/mcp"
              className="text-sm text-[var(--accent)] hover:underline inline-flex items-center gap-1"
            >
              Read the MCP integration guide
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[var(--text-faint)]">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5" />
            INITE Identity Provider · v1.1
          </div>
          <div className="flex items-center gap-4">
            <a href="/.well-known/openid-configuration" className="hover:text-[var(--text)]">
              OIDC
            </a>
            <a href="/.well-known/jwks.json" className="hover:text-[var(--text)]">
              JWKS
            </a>
            <a href="/health" className="hover:text-[var(--text)]">
              Status
            </a>
          </div>
        </footer>
      </main>
    </div>
  )
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center" />
      }
    >
      <HomeContent />
    </Suspense>
  )
}
