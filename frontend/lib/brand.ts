/**
 * Canonical brand / entity facts for INITE Identity.
 *
 * Kept consistent with the sibling products (billing's `lib/brand.ts`, brain's
 * `lib/seo.ts`): same parent organization, socials (`sameAs`), founder and logo
 * — so Identity resolves as a sub-brand of the same entity to search engines
 * and answer engines. Product-specific facts are this repo's own.
 *
 * Single source of truth for metadata, JSON-LD and the sitemap.
 */

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://auth.inite.ai'
).replace(/\/$/, '')

/** The parent organization — mirrored from the initeai brand-canonical. */
export const ORG = {
  name: 'INITE AI',
  legalName: 'inite LLC',
  url: 'https://inite.ai',
  logo: 'https://inite.ai/android-chrome-512x512.png',
  founder: { name: 'Mikhail Savchenko', jobTitle: 'Founder and CEO' },
  sameAs: [
    'https://www.linkedin.com/company/inite-ai/',
    'https://www.instagram.com/inite.ai',
    'https://t.me/initeai',
    'https://github.com/inite-ai',
  ],
} as const

/** The identity product entity. */
export const BRAND = {
  name: 'INITE Identity',
  shortName: 'INITE Identity',
  domain: SITE_URL,
  repo: 'https://github.com/inite-ai/inite-auth-service',
  docs: `${SITE_URL}/docs`,
  contactEmail: 'support@inite.ai',
  license: 'AGPL-3.0-or-later (open core) + commercial',
  sameAs: [...ORG.sameAs, 'https://github.com/inite-ai/inite-auth-service'],
  /** Verifiable product facts — keep true to the codebase. */
  facts: {
    mcpTools: 6, // @inite/auth-admin tool surface
    mcpSkills: 3,
    signInMethods: 6, // passkey, magic link, password, OTP, social, wallet
    walletChains: ['Ethereum', 'Polygon', 'TON'],
  },
} as const

/** Marketing metadata copy (title ≤ ~60 chars, description ≤ ~160). */
export const META = {
  title: 'INITE Identity — OAuth 2.0 / OIDC provider with passkeys',
  ogTitle: 'Identity that fits your stack.',
  description:
    'Self-hostable OAuth 2.0 / OIDC provider: passkeys, magic links, password fallback, Web3 wallet linking, service tokens for M2M auth, and an MCP surface for AI assistants.',
  keywords: [
    'OAuth 2.0 provider',
    'OpenID Connect provider',
    'self-hosted identity provider',
    'passkeys WebAuthn',
    'magic link authentication',
    'service tokens client_credentials',
    'DPoP PAR back-channel logout',
    'MCP authentication',
    'Auth0 alternative',
    'Keycloak alternative',
  ],
} as const

/** Landing feature list — shared by the page copy and the JSON-LD. */
export const FEATURE_LIST = [
  'Passkeys (WebAuthn) with Touch ID, Face ID, Windows Hello and hardware keys',
  'OAuth 2.0 / OIDC: authorization code + PKCE, refresh rotation, PAR, DPoP, back-channel logout',
  'Service tokens via client_credentials with audience-bound scoped JWTs',
  'Passwordless magic-link email sign-in with replay protection',
  'Web3 wallet linking for Ethereum, Polygon and TON via signed challenges',
  'Portable did:key decentralized identifier per user',
  'MCP tools and skills for AI assistants via @inite/auth-admin',
  'Self-hostable under AGPL-3.0 with a commercial license option',
] as const
