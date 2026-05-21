/**
 * Source of truth for the docs sidebar and the landing index.
 *
 * Adding a new docs page:
 * 1. Add an entry here (slug = the route segment under `/docs/`).
 * 2. Drop a `frontend/app/docs/<slug>/page.mdx`.
 * 3. The sidebar, landing cards, and prev/next pager pick it up.
 *
 * Order inside a group is the rendering order.
 */
export interface DocPage {
  slug: string
  title: string
  /** Short description shown on the docs landing card. */
  description: string
}

export interface DocGroup {
  heading: string
  pages: DocPage[]
}

export const DOCS_GROUPS: DocGroup[] = [
  {
    heading: 'Start here',
    pages: [
      {
        slug: 'getting-started',
        title: 'Getting started',
        description:
          'Three rapid-start recipes — pure fetch, SDK, iframe drop-in.',
      },
    ],
  },
  {
    heading: 'Integrate',
    pages: [
      {
        slug: 'sdk',
        title: 'SDK reference',
        description: '@inite/auth-sdk — IniteAuth class, React adapter, mountEmbed.',
      },
      {
        slug: 'oauth-flows',
        title: 'OAuth flows',
        description: 'Authorization code + PKCE, refresh, device, with curl recipes.',
      },
      {
        slug: 'service-tokens',
        title: 'Service tokens',
        description: 'Backend-to-backend M2M auth via client_credentials.',
      },
    ],
  },
  {
    heading: 'AI integration',
    pages: [
      {
        slug: 'mcp',
        title: 'MCP for assistants',
        description:
          '@inite/auth-admin — six tools and three skills exposed via the per-vertical MCP route.',
      },
    ],
  },
  {
    heading: 'Reference',
    pages: [
      {
        slug: 'oidc',
        title: 'OIDC reference',
        description:
          'Discovery, JWKS, supported claims, AMR/ACR, DPoP, PAR, back-channel logout.',
      },
      {
        slug: 'security',
        title: 'Security model',
        description:
          'Lockout, HIBP, IP flood guard, audit log, security notifications.',
      },
      {
        slug: 'self-hosting',
        title: 'Self-hosting',
        description: 'Env vars, Prisma migrations, docker-compose, metrics, backups.',
      },
    ],
  },
]

/** Flattened ordered list — used by the prev/next pager. */
export const DOCS_PAGES: DocPage[] = DOCS_GROUPS.flatMap((g) => g.pages)

export function adjacentDocs(currentSlug: string): {
  prev: DocPage | null
  next: DocPage | null
} {
  const idx = DOCS_PAGES.findIndex((p) => p.slug === currentSlug)
  if (idx === -1) return { prev: null, next: null }
  return {
    prev: idx > 0 ? DOCS_PAGES[idx - 1] : null,
    next: idx < DOCS_PAGES.length - 1 ? DOCS_PAGES[idx + 1] : null,
  }
}
