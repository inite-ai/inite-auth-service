import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { BlogPost } from '@/lib/blog'
import { FAMILY_RESEARCH_LABEL, familyResearchFor } from '@/lib/family-research'

/** "3 November 2026" from an ISO date, fixed to UTC so server and client agree. */
export function formatPostDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** Breadcrumb, H1 and date: the top of every post. The H1 is the post's title. */
export function PostHeader({ post }: { post: BlogPost }) {
  return (
    <header className="mb-6">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs text-[var(--text-faint)] mb-4"
      >
        <Link href="/blog" className="hover:text-[var(--text-muted)]">
          Blog
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-[var(--text-muted)] truncate">{post.category}</span>
      </nav>
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)] mt-2 mb-3">
        {post.title}
      </h1>
      <p className="text-xs text-[var(--text-faint)]">
        <time dateTime={post.published}>{formatPostDate(post.published)}</time>
        {post.updated !== post.published && (
          <>
            {' · updated '}
            <time dateTime={post.updated}>{formatPostDate(post.updated)}</time>
          </>
        )}
      </p>
    </header>
  )
}

/**
 * Under a post: the inite.ai study that measures what the post is about
 * (lib/family-research.ts), or nothing, then the way back to the index.
 * A plain link, no script, so it needs nothing from the CSP.
 */
export function PostFooter({ post }: { post: BlogPost }) {
  const link = familyResearchFor(post, 'auth')
  return (
    <footer className="mt-16 pt-6 border-t border-[var(--border)] space-y-6">
      {link && (
        <aside
          data-family-research={link.study}
          className="p-4 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]"
        >
          <p className="text-[10px] font-semibold tracking-[0.08em] text-[var(--text-faint)] uppercase">
            {FAMILY_RESEARCH_LABEL}
          </p>
          <p className="mt-2 text-sm font-semibold">
            <a
              href={link.href}
              className="text-[var(--accent)] hover:text-[var(--accent-hover)] underline decoration-[var(--accent)]/30 underline-offset-2"
            >
              {link.title}
            </a>
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">{link.lead}</p>
        </aside>
      )}
      <Link href="/blog" className="inline-block text-sm text-[var(--text-muted)] hover:text-[var(--text)]">
        ← All posts
      </Link>
    </footer>
  )
}
