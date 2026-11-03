/**
 * Source of truth for the blog: the index, the sitemap, each post's metadata,
 * its Article JSON-LD and the family research link under it all read this
 * list, so adding a post is one entry here plus `app/blog/<slug>/page.mdx`.
 *
 * Every post answers one measured query (`query`, DataForSEO US, 03.11.2026).
 * `tags` and `category` describe what the post is about; the family research
 * link (lib/family-research.ts) is chosen from them and the title, so they
 * must stay honest: a tag added to win a link is a wrong link.
 */
export interface BlogPost {
  slug: string
  /** H1 and <title> stem; carries the target query. */
  title: string
  /** Meta description and index card text (≤ ~160 chars). */
  description: string
  /** The search query the post answers. */
  query: string
  /** ISO dates. `updated` drives the sitemap's lastModified. */
  published: string
  updated: string
  tags: readonly string[]
  category: string
}

export const BLOG_POSTS: readonly BlogPost[] = [
  {
    slug: 'mcp-oauth',
    title: 'MCP OAuth: how authorization works in the Model Context Protocol',
    description:
      'OAuth 2.1 in MCP, step by step: protected resource metadata, authorization server discovery, client registration, PKCE, resource indicators and token audience.',
    query: 'mcp oauth',
    published: '2026-11-03',
    updated: '2026-11-03',
    tags: ['mcp', 'oauth', 'authorization'],
    category: 'MCP',
  },
  {
    slug: 'mcp-authentication',
    title: 'MCP authentication: how an MCP server knows who is calling',
    description:
      'How an MCP server authenticates clients and users over HTTP, what the MCP authorization spec requires, and where STDIO servers get their credentials.',
    query: 'mcp authentication',
    published: '2026-11-03',
    updated: '2026-11-03',
    tags: ['mcp', 'authentication', 'oauth'],
    category: 'MCP',
  },
  {
    slug: 'oidc-provider',
    title: 'OIDC provider: what it does and what to check before you pick one',
    description:
      'What an OpenID Connect provider does, the flows it runs, and the checklist: discovery, JWKS, PKCE, passkeys, back-channel logout, with the specs behind each.',
    query: 'oidc provider',
    published: '2026-11-03',
    updated: '2026-11-03',
    tags: ['oidc', 'openid connect', 'oauth'],
    category: 'Identity standards',
  },
  {
    slug: 'auth0-alternative',
    title: 'Auth0 alternative: what to compare and how each one charges',
    description:
      'Choosing an Auth0 alternative: the questions that decide it, and how Clerk, WorkOS, Stytch, Supabase Auth, Cognito, Keycloak, Zitadel and Ory price, with links.',
    query: 'auth0 alternative',
    published: '2026-11-03',
    updated: '2026-11-03',
    tags: ['auth0', 'ciam', 'pricing'],
    category: 'SaaS authentication',
  },
  {
    slug: 'keycloak-alternative',
    title: 'Keycloak alternative: self-hosted and managed options, and their cost',
    description:
      'A Keycloak alternative for teams tired of running it: self-hosted projects, managed Keycloak and hosted identity, compared on licence, pricing and operations.',
    query: 'keycloak alternative',
    published: '2026-11-03',
    updated: '2026-11-03',
    tags: ['keycloak', 'self-hosting', 'pricing'],
    category: 'SaaS authentication',
  },
]

export function getPost(slug: string): BlogPost {
  const post = BLOG_POSTS.find((p) => p.slug === slug)
  if (!post) throw new Error(`blog: no post with slug "${slug}" in lib/blog.ts`)
  return post
}
