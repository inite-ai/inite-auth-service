import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/brand'

/**
 * Cite-yes / train-no policy, mirrored from the sibling INITE properties
 * (billing, brain) so the ecosystem presents one consistent stance:
 *
 *   CITATION_GRADE — answer-engine crawlers that send cited traffic back.
 *   BLOCKED        — training-only or no-upside crawlers.
 *
 * Everything auth-gated or single-use (login, consent, device, account) is
 * kept out of the index for every agent: those routes render a form, not
 * content, and each one indexed is crawl budget spent on nothing.
 */
const CITATION_GRADE = [
  'OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot',
  'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'MistralAI-User',
  'Kagibot', 'Brave-SearchBot', 'xAI-Bot', 'YouBot',
]

const BLOCKED = [
  'GPTBot', 'ClaudeBot', 'bingbot-Extended', 'anthropic-ai', 'Bytespider',
  'Meta-ExternalAgent', 'FacebookBot', 'Amazonbot', 'cohere-ai', 'Diffbot',
  'Omgilibot', 'Webzio-Extended', 'MJ12bot',
]

/**
 * Auth surfaces and account chrome — never indexable.
 *
 * Exported so __tests__/noindex-parity.test.ts can hold the claim to account.
 * Every route here is a client component, so it cannot export metadata of its
 * own and inherits the root layout's `index, follow` unless a layout.tsx says
 * otherwise. Disallowing a path in this file while the page itself invites
 * indexing is the contradiction that test exists to catch.
 */
export const APP_PATHS = [
  '/account', '/admin', '/login', '/register', '/auth/', '/oauth/', '/consent',
  '/device', '/verify', '/verify-email', '/embed/',
]

export default function robots(): MetadataRoute.Robots {
  const marketing = { allow: ['/', '/docs'], disallow: APP_PATHS }
  return {
    rules: [
      { userAgent: '*', ...marketing },
      ...CITATION_GRADE.map((userAgent) => ({ userAgent, ...marketing })),
      ...BLOCKED.map((userAgent) => ({ userAgent, disallow: '/' })),
      { userAgent: 'AhrefsBot', crawlDelay: 10 },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
