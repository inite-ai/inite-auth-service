import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { DOCS_GROUPS } from '@/lib/docs-nav'

export const metadata = {
  title: 'Docs · INITE',
  description: 'How to integrate INITE Identity Provider — SDK, OAuth, OIDC, service tokens.',
}

/**
 * Docs landing — grouped grid of every doc page. Mirrors the sidebar
 * so visitors get the same map of the docs whether they land on the
 * index or any sub-page.
 */
export default function DocsIndex() {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">
        Documentation
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-muted)]">
        INITE is an OAuth 2.0 / OIDC identity provider with passkeys, magic
        links, password fallback, Web3 wallet linking, and a service-token
        surface for backend-to-backend auth. Pick the recipe that fits your
        stack — or read the reference to integrate manually.
      </p>

      <div className="mt-10 space-y-10">
        {DOCS_GROUPS.map((group) => (
          <section key={group.heading}>
            <h2 className="text-[10px] font-semibold tracking-[0.08em] text-[var(--text-faint)] uppercase mb-3">
              {group.heading}
            </h2>
            <ul className="grid gap-2">
              {group.pages.map((page) => (
                <li key={page.slug}>
                  <Link
                    href={`/docs/${page.slug}`}
                    className="group flex items-start gap-3 p-4 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text)]">
                        {page.title}
                      </p>
                      <p className="mt-0.5 text-[13px] text-[var(--text-muted)] leading-relaxed">
                        {page.description}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[var(--text-faint)] mt-0.5 group-hover:text-[var(--accent)] transition-colors" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}
