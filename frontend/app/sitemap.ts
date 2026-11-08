import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/brand'
import { DOCS_PAGES } from '@/lib/docs-nav'
import { BLOG_POSTS } from '@/lib/blog'

/**
 * Indexable surface: the product landing, the docs tree and the blog. Every other
 * route is an auth flow (see `robots.ts`) and stays out.
 *
 * Docs entries are derived from `DOCS_PAGES`, so adding a page to the sidebar
 * adds it to the sitemap — no second list to forget. Blog entries come from
 * `BLOG_POSTS` the same way, dated by each post's `updated`.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/docs`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    ...DOCS_PAGES.map((p) => ({
      url: `${SITE_URL}/docs/${p.slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    ...BLOG_POSTS.map((p) => ({
      url: `${SITE_URL}/blog/${p.slug}`,
      lastModified: new Date(`${p.updated}T00:00:00Z`),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ]
}
