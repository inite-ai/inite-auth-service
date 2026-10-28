import { BadRequestException } from '@nestjs/common';
import { isDynamicClientId } from './oauth-scopes.registry';

/**
 * Which RFC 8707 resources an unrestricted client may bind a token to.
 *
 * WHY. A client registered through RFC 7591 gets `allowedAudiences = []`,
 * and an empty list used to mean "any resource". So a `dcr_*` client could
 * ask for `resource=inite-ai` or `resource=brain` and get a token whose
 * `aud` is a first-party client id. Resource servers accept those as their
 * own sessions. Any self-registered client could then mint a token that
 * inite.ai or brain reads as first-party (family-mcp-2026-10 S6).
 *
 * THE RULE. A client with no allow-list of its own (every `dcr_*` client,
 * and a public client such as `inite-cli` on the user flows) may name only
 * a registered resource:
 *   - an absolute `https:` URL with no fragment, no userinfo and no port
 *     override, whose host is one of the family's domains or a subdomain
 *     of one; or
 *   - an exact URL or origin listed in `OAUTH_RESOURCE_REGISTRY`
 *     (comma-separated), for local development and new products.
 *
 * A bare identifier ("brain", "inite-ai") is never a registered resource.
 * A client provisioned with `allowedAudiences` keeps its own list. An absent
 * resource still yields the client-id audience, unchanged.
 */
export const FAMILY_DOMAINS: readonly string[] = [
  'inite.ai',
  'inite.services',
  'inite.rent',
  'inite.estate',
  'inite.digital',
  'inite.club',
  'inite.solutions',
  'inite.fund',
  'inite.studio',
  'inite.shop',
  'inite.food',
  'inite.travel',
  'inite.events',
  'inite.health',
  'inite.training',
  'inite.education',
  'inite.sport',
  // www.mikefluff.com/mcp, the owner's own site, is served from this AS
  // (oauth-scopes.registry.ts MIKEFLUFF_SCOPES).
  'mikefluff.com',
];

function extraEntries(env: string | undefined = process.env.OAUTH_RESOURCE_REGISTRY): string[] {
  return (env ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function onFamilyHost(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return FAMILY_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Is `resource` one a client without its own allow-list may be issued a token for? */
export function isRegisteredResource(resource: string, env?: string): boolean {
  let url: URL;
  try {
    url = new URL(resource);
  } catch {
    return false;
  }
  if (url.hash || resource.includes('#')) return false;
  if (url.username || url.password) return false;
  const trimmed = resource.replace(/\/$/, '');
  const extra = extraEntries(env);
  if (extra.includes(trimmed) || extra.includes(url.origin)) return true;
  if (url.protocol !== 'https:') return false;
  if (url.port) return false;
  return onFamilyHost(url);
}

/**
 * Must this client's requested resource be a registered one? True for every
 * dynamically registered client and for a public client with no allow-list.
 * A client with an explicit `allowedAudiences` list is held to that list.
 */
export function needsRegisteredResource(client: {
  clientId: string;
  isPublic?: boolean | null;
  allowedAudiences?: readonly string[] | null;
}): boolean {
  if ((client.allowedAudiences ?? []).length > 0) return false;
  return isDynamicClientId(client.clientId) || client.isPublic === true;
}

/** Throws RFC 8707 `invalid_target` when the client may not bind to `resource`. */
export function assertResourceAllowed(
  client: { clientId: string; isPublic?: boolean | null; allowedAudiences?: readonly string[] | null },
  resource: string | null | undefined,
): void {
  if (!resource) return;
  if (!needsRegisteredResource(client)) return;
  if (!isRegisteredResource(resource)) {
    throw new BadRequestException({
      error: 'invalid_target',
      error_description: `Resource "${resource}" is not a registered INITE resource`,
    });
  }
}
