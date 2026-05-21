'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { AppHeader } from '@/components/AppHeader'
import { DOCS_GROUPS, adjacentDocs, DOCS_PAGES } from '@/lib/docs-nav'

interface Props {
  children: ReactNode
}

/**
 * Docs shell: AppHeader on top, persistent left sidebar of section
 * groups, content column with breadcrumb and prev/next pager. The
 * sidebar disappears under md so the page stays readable on phones.
 */
export default function DocsLayout({ children }: Props) {
  const pathname = usePathname()
  const currentSlug = pathname?.replace(/^\/docs\/?/, '').split('/')[0] ?? ''
  const currentPage = DOCS_PAGES.find((p) => p.slug === currentSlug)
  const { prev, next } = adjacentDocs(currentSlug)

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <AppHeader hideUserMenu context="Docs" />

      <div className="max-w-6xl mx-auto px-4 md:grid md:grid-cols-[12rem_1fr] lg:grid-cols-[14rem_1fr] md:gap-8">
        <aside className="hidden md:block sticky top-12 self-start py-8 max-h-[calc(100vh-3rem)] overflow-y-auto">
          <nav aria-label="Documentation">
            {DOCS_GROUPS.map((group) => (
              <div key={group.heading} className="mb-6">
                <p className="text-[10px] font-semibold tracking-[0.08em] text-[var(--text-faint)] uppercase mb-2">
                  {group.heading}
                </p>
                <ul className="space-y-0.5">
                  {group.pages.map((page) => {
                    const active = currentSlug === page.slug
                    return (
                      <li key={page.slug}>
                        <Link
                          href={`/docs/${page.slug}`}
                          aria-current={active ? 'page' : undefined}
                          className={`block px-2 py-1 text-sm rounded transition-colors ${
                            active
                              ? 'bg-[var(--bg-overlay)] text-[var(--text)]'
                              : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-overlay)]'
                          }`}
                        >
                          {page.title}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <main className="py-8 max-w-3xl min-w-0">
          {currentPage && (
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1.5 text-xs text-[var(--text-faint)] mb-4"
            >
              <Link href="/docs" className="hover:text-[var(--text-muted)]">
                Docs
              </Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-[var(--text-muted)]">{currentPage.title}</span>
            </nav>
          )}

          <article className="docs-content">{children}</article>

          {(prev || next) && (
            <div className="mt-16 pt-6 border-t border-[var(--border)] grid grid-cols-2 gap-4">
              {prev ? (
                <Link
                  href={`/docs/${prev.slug}`}
                  className="p-3 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)] transition-colors"
                >
                  <span className="block text-[11px] text-[var(--text-faint)]">
                    Previous
                  </span>
                  <span className="block text-sm font-medium text-[var(--text)] mt-0.5">
                    {prev.title}
                  </span>
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link
                  href={`/docs/${next.slug}`}
                  className="p-3 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)] transition-colors text-right"
                >
                  <span className="block text-[11px] text-[var(--text-faint)]">
                    Next
                  </span>
                  <span className="block text-sm font-medium text-[var(--text)] mt-0.5">
                    {next.title}
                  </span>
                </Link>
              ) : (
                <span />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
