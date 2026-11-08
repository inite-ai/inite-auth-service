/**
 * Metadata and JSON-LD for the blog: one canonical per post, a BlogPosting
 * with a BreadcrumbList per post, and a Blog node on the index. The words come
 * from lib/blog.ts, the same list the pages render, so the machine-readable
 * layer cannot drift from the visible one.
 */
import type { Metadata } from 'next'
import { SITE_URL, BRAND, META } from './brand'
import type { BlogPost } from './blog'

const OG_IMAGE = `${SITE_URL}/opengraph-image`
const BLOG_URL = `${SITE_URL}/blog`

type Json = Record<string, unknown>

export const BLOG_TITLE = 'Blog · INITE Identity'
export const BLOG_DESCRIPTION =
  'Notes for developers and SaaS founders on OAuth, OpenID Connect, MCP authorization and choosing an identity provider, with every number linked to its source.'

/** Blog index metadata. */
export function buildBlogIndexMetadata(): Metadata {
  return {
    title: BLOG_TITLE,
    description: BLOG_DESCRIPTION,
    alternates: { canonical: '/blog' },
    openGraph: {
      type: 'website',
      siteName: BRAND.name,
      url: BLOG_URL,
      title: BLOG_TITLE,
      description: BLOG_DESCRIPTION,
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: META.ogTitle }],
    },
  }
}

/** Post metadata. A page-level openGraph replaces the layout's, so the image is restated. */
export function buildPostMetadata(post: BlogPost): Metadata {
  const path = `/blog/${post.slug}`
  return {
    title: `${post.title} · INITE`,
    description: post.description,
    keywords: [post.query, ...post.tags],
    alternates: { canonical: path },
    openGraph: {
      type: 'article',
      siteName: BRAND.name,
      url: `${SITE_URL}${path}`,
      title: post.title,
      description: post.description,
      publishedTime: post.published,
      modifiedTime: post.updated,
      tags: [...post.tags],
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: META.ogTitle }],
    },
  }
}

/** BlogPosting + BreadcrumbList for one post. */
export function buildPostJsonLd(post: BlogPost): Json {
  const url = `${BLOG_URL}/${post.slug}`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        '@id': `${url}#article`,
        headline: post.title,
        description: post.description,
        url,
        mainEntityOfPage: url,
        datePublished: post.published,
        dateModified: post.updated,
        inLanguage: 'en',
        keywords: [post.query, ...post.tags].join(', '),
        articleSection: post.category,
        image: OG_IMAGE,
        isPartOf: { '@id': `${BLOG_URL}#blog` },
        author: { '@id': `${SITE_URL}/#organization` },
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: BRAND.name, item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: BLOG_URL },
          { '@type': 'ListItem', position: 3, name: post.title, item: url },
        ],
      },
    ],
  }
}

/** Blog node for the index, listing every post. */
export function buildBlogJsonLd(posts: readonly BlogPost[]): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': `${BLOG_URL}#blog`,
    name: BLOG_TITLE,
    description: BLOG_DESCRIPTION,
    url: BLOG_URL,
    inLanguage: 'en',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    blogPost: posts.map((p) => ({
      '@type': 'BlogPosting',
      '@id': `${BLOG_URL}/${p.slug}#article`,
      headline: p.title,
      url: `${BLOG_URL}/${p.slug}`,
      datePublished: p.published,
      dateModified: p.updated,
    })),
  }
}
