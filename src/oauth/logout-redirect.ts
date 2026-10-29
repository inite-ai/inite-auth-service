import { isDynamicClientId } from './oauth-scopes.registry';
import { onFamilyHost } from './resource-registry';

/** What the post-logout check needs from the rest of the service. */
export interface LogoutRedirectDeps {
  /** The active client row, or null when there is none. */
  findClient(clientId: string): Promise<{ clientId: string; redirectUris: readonly string[] } | null>;
  /** The client an id_token_hint was minted for, or null when the hint is not ours. */
  hintClientId(idTokenHint: string): Promise<string | null>;
  /** The first-party origins (OAuthOriginsService). */
  isTrustedOrigin(origin: string): Promise<boolean>;
}

export interface LogoutRedirectInput {
  postLogoutRedirectUri?: string;
  state?: string;
  clientId?: string;
  idTokenHint?: string;
}

function originOf(uri: string): string | null {
  try {
    return new URL(uri).origin;
  } catch {
    return null;
  }
}

/** Which client is asking: client_id, the id_token_hint's audience, or none. Undefined = refuse. */
async function identifyClient(
  input: LogoutRedirectInput,
  deps: LogoutRedirectDeps,
): Promise<string | null | undefined> {
  let fromHint: string | null = null;
  if (input.idTokenHint) {
    fromHint = await deps.hintClientId(input.idTokenHint);
    if (!fromHint) return undefined;
  }
  if (input.clientId && fromHint && input.clientId !== fromHint) return undefined;
  return input.clientId || fromHint || null;
}

async function isAllowedTarget(
  url: URL,
  clientId: string | null,
  deps: LogoutRedirectDeps,
): Promise<boolean> {
  if (!clientId) {
    return url.protocol === 'https:' && (onFamilyHost(url) || (await deps.isTrustedOrigin(url.origin)));
  }
  if (isDynamicClientId(clientId)) return false;
  const client = await deps.findClient(clientId);
  return !!client && client.redirectUris.some((r) => originOf(r) === url.origin);
}

/**
 * Where /oauth/logout may send the browser afterwards, or null to stay home.
 *
 * Before, any URI whose origin matched any active client's redirect origin
 * passed, self-registered clients included, which made the endpoint an open
 * redirect. Now the redirect is bound to the client that asks:
 * - named by `client_id` or by the audience of a valid `id_token_hint`
 *   (both, if given, must agree): the URI's origin must be one of that
 *   client's own registered redirect origins. A self-registered (`dcr_*`)
 *   client gets no redirect at all, since anyone can register any origin.
 * - no client named: the URI must be https on a family domain, or on the
 *   origin of a first-party client (OAuthOriginsService).
 */
export async function resolvePostLogoutRedirect(
  input: LogoutRedirectInput,
  deps: LogoutRedirectDeps,
): Promise<string | null> {
  const uri = input.postLogoutRedirectUri;
  if (!uri) return null;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const clientId = await identifyClient(input, deps);
  if (clientId === undefined) return null;
  if (!(await isAllowedTarget(url, clientId, deps))) return null;

  if (input.state) url.searchParams.set('state', input.state);
  return url.toString();
}
