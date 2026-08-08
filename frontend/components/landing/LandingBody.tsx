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
import { LANDING_FAQ } from '@/lib/seo'

/**
 * Static half of the landing — a server component, so every word ships in the
 * HTML document. Rendered as `children` of LandingShell, which owns the
 * interactive chrome.
 */

const FEATURES = [
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

const CHECKLIST = [
  'Account lockout with exponential backoff',
  'HIBP breached-password rejection',
  'Per-IP credential-stuffing defence',
  'Audit log surfaced to users and admins',
  'Embed-ready: CORS + CSP per partner',
  'Self-hostable, OSS license',
]

const SDK_SNIPPET = `import { IniteAuth } from '@inite/auth-sdk'

const auth = new IniteAuth({ clientId: 'your-app-id' })
const { user, accessToken } = await auth.loginWithPassword({
  email, password,
})`

const MCP_SNIPPET = `import { registerAuthAdminTool, authAdminSkills } from '@inite/auth-admin'
import { registerSkill } from '@inite/skills'

registerAuthAdminTool()
for (const s of authAdminSkills) registerSkill(s)`

function CodeCard({ label, code }: { label: string; code: string }) {
  return (
    <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--border)] text-[11px] font-mono text-[var(--text-faint)]">
        {label}
      </div>
      <pre className="px-4 py-4 text-[12px] leading-relaxed font-mono text-[var(--text)] overflow-x-auto">
        {code}
      </pre>
    </div>
  )
}

export function LandingBody() {
  return (
    <>
      <section className="py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {FEATURES.map((f) => {
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
          {CHECKLIST.map((line) => (
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

      <section className="py-12 border-t border-[var(--border)]">
        <h2 className="text-lg font-semibold text-[var(--text)] tracking-tight">
          Embed in five lines.
        </h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Headless SDK + drop-in iframe widget. CORS and CSP auto-allow
          registered partner origins.
        </p>
        <CodeCard label="@inite/auth-sdk" code={SDK_SNIPPET} />
      </section>

      <section className="py-12 border-t border-[var(--border)]">
        <h2 className="text-lg font-semibold text-[var(--text)] tracking-tight">
          AI assistants ship as a peer dependency.
        </h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Two lines in your vertical&apos;s bootstrap exposes provisioning,
          rotation, audit and revoke through every MCP client. Per-tenant role
          gates layer on top of OAuth scope.
        </p>
        <CodeCard label="@inite/auth-admin" code={MCP_SNIPPET} />
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

      <section className="py-12 border-t border-[var(--border)]">
        <h2 className="text-lg font-semibold text-[var(--text)] tracking-tight">
          Questions people ask before adopting.
        </h2>
        <dl className="mt-6 space-y-6">
          {LANDING_FAQ.map((item) => (
            <div key={item.q}>
              <dt className="text-sm font-medium text-[var(--text)]">
                {item.q}
              </dt>
              <dd className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-muted)]">
                {item.a}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="py-8 border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[var(--text-faint)]">
        <div className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5" />
          INITE Identity Provider · v1.1
        </div>
        <div className="flex items-center gap-4">
          <Link href="/docs" className="hover:text-[var(--text)]">
            Docs
          </Link>
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
    </>
  )
}
