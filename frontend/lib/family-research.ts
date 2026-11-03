/**
 * The family research link under a blog post: the one inite.ai study that
 * measures what the post is about, or nothing.
 *
 * Ported from inite-shared `packages/landing/src/family-research.ts`
 * (`familyResearchFor`, as of inite-ai/inite-shared#99, commit 5e470ad).
 * This frontend cannot import `@inite/landing`: the package is private, not
 * published, and this repo does not carry inite-shared as a submodule. The
 * rules, their order and the price-index condition below are the upstream
 * ones, unchanged; only the English words are kept because this site is
 * English only.
 * Change the rules upstream first, then mirror them here.
 */

type Words = { title: string; lead: string }

export const FAMILY_STUDIES = {
  'whatsapp-pricing': {
    path: '/research/whatsapp-pricing',
    en: {
      title: 'WhatsApp Business API and AI receptionist prices',
      lead: "Meta's per-message WhatsApp rates in every market on its rate card, and what AI receptionists and WhatsApp platforms charge, read off their own pricing pages. Monthly, dated, with a CSV.",
    },
  },
  'mcp-leaderboard': {
    path: '/research/mcp-leaderboard',
    en: {
      title: "MCP Leaderboard: the week's best MCP servers, measured daily",
      lead: "Every week, vendors' own MCP servers ranked by the INITE Atlas score, beside their daily checks: who answered all week, who moved, which servers are new and which did not answer. Dated, with a CSV.",
    },
  },
  'agent-readiness': {
    path: '/research/agent-readiness',
    en: {
      title: 'Agent readiness census',
      lead: 'How many websites an AI agent can act on, not just read: MCP doors, platform doors, UCP commerce profiles and booking partners, counted monthly on public domains.',
    },
  },
  analyze: {
    path: '/analyze',
    en: {
      title: 'What a machine sees on your site',
      lead: 'Enter a website address and the report builds on this page.',
    },
  },
  'ai-apps': {
    path: '/research/ai-apps',
    en: {
      title: 'AI apps by usage: which grew fastest this week',
      lead: "Every week, the AI apps that use the most model tokens through OpenRouter: who grew fastest, who fell, who is new on the lists, and which models carry the traffic. From OpenRouter's public data, dated, with a CSV.",
    },
  },
  'price-index': {
    path: '/research/price-index',
    en: {
      title: 'State of AI prices: what AI tools cost, by category',
      lead: "Every month, the median cheapest paid plan of the AI and SaaS tools in the INITE Atlas, by category, with the middle half, the share with a free plan and the share priced by usage. Read off the vendors' own pricing pages. Dated, with a CSV.",
    },
  },
  'price-watch': {
    path: '/research/price-watch',
    en: {
      title: 'Price Watch: AI tool price changes this week',
      lead: "Every week, the AI and SaaS tools in the INITE Atlas whose price or free plan changed, confirmed by two readings of the vendor's own pricing page. Dated, with sources and a CSV.",
    },
  },
} as const satisfies Record<string, { path: string; en: Words }>

export type FamilyStudy = keyof typeof FAMILY_STUDIES

/** Whole words in any script (JS's \b is ASCII only). */
const words = (...alts: string[]) =>
  new RegExp(`(?<![\\p{L}\\p{N}])(${alts.join('|')})(?![\\p{L}\\p{N}])`, 'u')

/** First match wins; narrow subjects first. Same order as upstream. */
const RULES: readonly [FamilyStudy, RegExp][] = [
  [
    'whatsapp-pricing',
    words(
      'whats ?app', 'receptionists?', 'recepcionistas?', 'ресепшен\\p{L}*',
      'ии-администратор\\p{L}*', 'phone agents?', 'voice (ai|agents?)', 'ai calls?',
      'голосов\\p{L}* (агент|робот|бот)\\p{L}*', 'robôs? de voz', 'agentes? de voz',
      'call ?cent\\p{L}*', 'автодозвон\\p{L}*', 'auto-?dialers?',
    ),
  ],
  ['mcp-leaderboard', words('mcp', 'model context protocol', 'agent skills?')],
  [
    'agent-readiness',
    words(
      'agentic commerce', 'agent(ic)? checkout', 'ucp', 'acp', 'agents? (buy|pay|book)\\p{L}*',
      'агентн\\p{L}* (торговл|коммерц)\\p{L}*', 'comércio agêntico', 'comercio agéntico',
    ),
  ],
  [
    'analyze',
    words(
      'aeo', 'geo', 'llm seo', 'ai search', 'ai visibility', 'answer engines?',
      'generative engines?', 'видимост\\p{L}* в (ии|ai)', 'visibilidade (em|na) ia',
      'visibilidad en (la )?ia',
    ),
  ],
  ['ai-apps', words('openrouter', 'token usage', 'ai apps? by usage')],
  [
    'price-index',
    words(
      'pricing', 'prices?', 'cost of', 'how much', 'subscriptions?',
      'цен(а|ы|е|у|ой|ам|ах|ами)?', 'ценообразовани\\p{L}*', 'стоимост\\p{L}*',
      'preços?', 'precios?', 'byok',
    ),
  ],
]

/** What the price index is about: AI and software tools, their plans and models. */
const TOOLS = words(
  'ai', 'ии', 'ia', 'llms?', 'models?', 'saas', 'software', 'tools?', 'apps?', 'byok',
  'anthropic', 'openai', 'chatgpt', 'claude', 'инструмент\\p{L}*', 'нейросет\\p{L}*',
  'ferramentas?', 'herramientas?',
)

export interface PostTopic {
  title: string
  tags?: readonly string[]
  category?: string | null
}

/** The study a post is about, or null. Pure. */
export function studyFor(post: PostTopic): FamilyStudy | null {
  const text = [post.title, post.category ?? '', ...(post.tags ?? [])].join(' ').toLowerCase()
  for (const [study, rule] of RULES) {
    if (!rule.test(text)) continue
    // A business's own price list is not what the price index measures; read
    // on title and category only, as upstream does.
    if (study === 'price-index' && !TOOLS.test(`${post.title} ${post.category ?? ''}`.toLowerCase())) continue
    return study
  }
  return null
}

export interface FamilyResearchLink {
  study: FamilyStudy
  href: string
  title: string
  lead: string
}

/**
 * The link for an English post on `site` ("auth"), or null. Pure. Upstream
 * takes a language too; this site writes in English only, so it is fixed.
 */
export function familyResearchFor(post: PostTopic, site: string): FamilyResearchLink | null {
  const study = studyFor(post)
  if (!study) return null
  const s = FAMILY_STUDIES[study]
  return { study, href: `https://inite.ai/en${s.path}?from=blog:${site}`, ...s.en }
}

export const FAMILY_RESEARCH_LABEL = 'The data behind this'
