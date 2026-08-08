import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/brand'
import { DOCS_PAGES } from '@/lib/docs-nav'

/**
 * Indexable surface: the product landing plus the docs tree. Every other
 * route is an auth flow (see `robots.ts`) and stays out.
 *
 * Docs entries are derived from `DOCS_PAGES`, so adding a page to the sidebar
 * adds it to the sitemap — no second list to forget.
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
  ]
}
