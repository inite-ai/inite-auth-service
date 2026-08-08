/**
 * Metadata + JSON-LD builders for the indexable surface (landing and docs).
 *
 * The landing had neither: crawlers received a five-word document because the
 * page rendered client-side only, and no structured data at all. Both are
 * fixed at the source — the copy below is the same copy the page renders, so
 * the machine-readable layer cannot drift from the human one.
 */
import type { Metadata } from 'next'
import { SITE_URL, BRAND, ORG, META, FEATURE_LIST } from './brand'

const OG_IMAGE = `${SITE_URL}/opengraph-image`

/** Shared robots directive — generous snippets for answer engines. */
const ROBOTS = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    'max-image-preview': 'large',
    'max-snippet': -1,
    'max-video-preview': -1,
  },
} as const

/** Site-wide defaults, applied in the root layout. */
export function buildSiteMetadata(): Metadata {
  return {
    metadataBase: new URL(SITE_URL),
    // No title template: docs pages author their own fully-qualified titles.
    title: META.title,
    description: META.description,
    applicationName: BRAND.name,
    authors: [{ name: ORG.name, url: ORG.url }],
    creator: ORG.name,
    publisher: ORG.name,
    category: 'technology',
    icons: { icon: '/favicon.ico' },
    robots: ROBOTS,
    openGraph: {
      type: 'website',
      siteName: BRAND.name,
      url: SITE_URL,
      locale: 'en_US',
      title: META.ogTitle,
      description: META.description,
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: META.ogTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      title: META.ogTitle,
      description: META.description,
      images: [OG_IMAGE],
    },
  }
}

/** Landing-specific overrides on top of the site defaults. */
export function buildLandingMetadata(): Metadata {
  return {
    title: META.title,
    description: META.description,
    keywords: [...META.keywords],
    alternates: { canonical: '/' },
  }
}

/** Docs page metadata — one canonical per slug, shared OG card. */
export function buildDocsMetadata(opts: {
  title: string
  description: string
  slug?: string
}): Metadata {
  const path = opts.slug ? `/docs/${opts.slug}` : '/docs'
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: path },
    // A page-level `openGraph` replaces the layout's wholesale rather than
    // merging into it, so the card image has to be restated here.
    openGraph: {
      type: 'article',
      siteName: BRAND.name,
      url: `${SITE_URL}${path}`,
      title: opts.title,
      description: opts.description,
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: META.ogTitle }],
    },
  }
}

/**
 * Curated FAQ, rendered on the landing and mirrored into the FAQPage schema
 * (AEO). Answers are self-contained — an answer engine quoting one in
 * isolation should still be correct. Structured data must match visible page
 * content, so this array is the single source for both.
 */
export const LANDING_FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'What is INITE Identity?',
    a: 'INITE Identity is a self-hostable OAuth 2.0 and OpenID Connect provider. It covers passkeys, magic links, password fallback, one-time codes, social sign-in and Web3 wallet linking, plus service tokens for backend-to-backend authentication, behind one SDK, an embeddable iframe, or an MCP surface for AI assistants.',
  },
  {
    q: 'Which sign-in methods does INITE Identity support?',
    a: 'Six: passkeys (WebAuthn via Touch ID, Face ID, Windows Hello or a hardware key), passwordless magic links by email, password with HIBP breached-credential rejection, one-time codes, social providers, and Web3 wallets on Ethereum, Polygon and TON linked through signed challenges. Every user also receives a portable did:key identifier.',
  },
  {
    q: 'Can I self-host INITE Identity?',
    a: 'Yes. The service is open core, licensed under AGPL-3.0-or-later, and ships with Docker Compose, Prisma migrations, metrics and backup guidance. A commercial license is available for proprietary distribution or hosted offerings that cannot meet the AGPL network-source obligation.',
  },
  {
    q: 'Which OAuth 2.0 and OIDC features are implemented?',
    a: 'Authorization code with PKCE, refresh-token rotation, the client_credentials grant with audience binding, the device grant, Pushed Authorization Requests (PAR), DPoP sender-constrained tokens, and back-channel logout. Discovery is served at /.well-known/openid-configuration with keys at /.well-known/jwks.json.',
  },
  {
    q: 'How do AI assistants integrate with INITE Identity?',
    a: 'Through the Model Context Protocol. The @inite/auth-admin package exposes six auth-administration tools and three guided skills that any MCP client — Claude Desktop, Cursor, Goose, n8n — can call to register and rotate OAuth clients, inspect audit trails and revoke sessions, acting as the signed-in administrator rather than a separate service identity.',
  },
  {
    q: 'How is INITE Identity secured by default?',
    a: 'Hardening is opt-out, not opt-in: account lockout with exponential backoff, rejection of passwords found in known breaches, per-IP credential-stuffing defence, and an audit log queryable by both end users and operators. CORS and CSP auto-allow only registered partner origins.',
  },
]

type Json = Record<string, unknown>

/**
 * Landing structured data as a single @graph: Organization, WebSite,
 * SoftwareApplication and FAQPage cross-referenced by @id.
 */
export function buildLandingJsonLd(): Json {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${ORG.url}/#organization`,
        name: ORG.name,
        legalName: ORG.legalName,
        url: ORG.url,
        logo: { '@type': 'ImageObject', url: ORG.logo, width: 512, height: 512 },
        sameAs: ORG.sameAs,
        founder: {
          '@type': 'Person',
          name: ORG.founder.name,
          jobTitle: ORG.founder.jobTitle,
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: BRAND.name,
        url: SITE_URL,
        inLanguage: 'en',
        publisher: { '@id': `${ORG.url}/#organization` },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}/#app`,
        name: BRAND.name,
        applicationCategory: 'SecurityApplication',
        applicationSubCategory: 'Identity and access management',
        operatingSystem: 'Web, Linux, Docker',
        url: SITE_URL,
        description: META.description,
        image: OG_IMAGE,
        license: 'https://www.gnu.org/licenses/agpl-3.0.html',
        softwareHelp: { '@type': 'CreativeWork', url: BRAND.docs },
        codeRepository: BRAND.repo,
        featureList: [...FEATURE_LIST],
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          description:
            'Free and self-hostable under AGPL-3.0; commercial license available',
        },
        publisher: { '@id': `${ORG.url}/#organization` },
        provider: { '@id': `${ORG.url}/#organization` },
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE_URL}/#faq`,
        mainEntity: LANDING_FAQ.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  }
}

/** TechArticle + BreadcrumbList for a docs page. */
export function buildDocsJsonLd(opts: {
  title: string
  description: string
  slug: string
}): Json {
  const url = `${SITE_URL}/docs/${opts.slug}`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        '@id': `${url}/#article`,
        headline: opts.title,
        description: opts.description,
        url,
        inLanguage: 'en',
        isPartOf: { '@id': `${SITE_URL}/#website` },
        about: { '@id': `${SITE_URL}/#app` },
        publisher: { '@id': `${ORG.url}/#organization` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: BRAND.name, item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Docs', item: `${SITE_URL}/docs` },
          { '@type': 'ListItem', position: 3, name: opts.title, item: url },
        ],
      },
    ],
  }
}

/** Serialize JSON-LD for a <script> tag, escaping `<` to close no elements. */
export function jsonLdScript(data: Json): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
