import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { BLOG_POSTS } from '@/lib/blog'
import { BLOG_DESCRIPTION, buildBlogIndexMetadata, buildBlogJsonLd } from '@/lib/blog-seo'
import { jsonLdScript } from '@/lib/seo'
import { formatPostDate } from '@/components/blog/PostParts'

export const metadata = buildBlogIndexMetadata()

/** Blog index: every post, newest first, as cards in the docs' style. */
export default function BlogIndex() {
  const posts = [...BLOG_POSTS].sort((a, b) => b.published.localeCompare(a.published))
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(buildBlogJsonLd(posts)) }}
      />
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">Blog</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-muted)]">{BLOG_DESCRIPTION}</p>
      <ul className="mt-10 grid gap-2">
        {posts.map((post) => (
          <li key={post.slug}>
            <Link
              href={`/blog/${post.slug}`}
              className="group flex items-start gap-3 p-4 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-[var(--text-faint)]">
                  {post.category} · <time dateTime={post.published}>{formatPostDate(post.published)}</time>
                </p>
                <h2 className="mt-1 text-sm font-semibold text-[var(--text)]">{post.title}</h2>
                <p className="mt-0.5 text-[13px] text-[var(--text-muted)] leading-relaxed">
                  {post.description}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-[var(--text-faint)] mt-0.5 group-hover:text-[var(--accent)] transition-colors" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
