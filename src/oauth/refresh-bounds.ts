import { BadRequestException } from '@nestjs/common';
import { permittedScopes, type ScopeBoundClient } from './oauth-scopes.registry';
import { isResourceAllowed, type ResourceBoundClient } from './resource-registry';

/**
 * A refresh token that can no longer be used, answered as RFC 6749 §5.2
 * says: 400 with `error: invalid_grant`. Clients branch on that code — it
 * is how an MCP client (Claude among them) learns the sign-in is gone and
 * asks the person to connect again; a 401 here read as a transient fault
 * and the client kept retrying a dead token.
 */
export function deadRefreshToken(description: string): BadRequestException {
  return new BadRequestException({ error: 'invalid_grant', error_description: description });
}

/** The client row as the refresh grant sees it. */
export type RefreshBoundClient = ScopeBoundClient & ResourceBoundClient;

/**
 * A refresh obeys the same rule as the authorization_code grant it came
 * from: the rotated token carries only the scopes the client may hold today,
 * and stays bound only to a resource the client may still target.
 *
 * Scopes outside the rule are dropped, never added: unlike /authorize there
 * is no default here, so a refresh can only narrow. A resource the client
 * may no longer target ends the grant (`invalid_grant`), so the product sends
 * the person through sign-in again rather than holding a token for an
 * audience it was never meant to reach. Checked before the rotation is
 * claimed, so a refused refresh token is not burnt. Without a client row
 * (callers that predate the rule) the token is carried over as it was.
 */
export function refreshBounds(
  client: RefreshBoundClient | undefined,
  token: { scope: string | null; resource: string | null },
): { scope: string; resource: string | undefined } {
  if (!client) return { scope: token.scope ?? '', resource: token.resource ?? undefined };
  if (!isResourceAllowed(client, token.resource)) {
    throw new BadRequestException({
      error: 'invalid_grant',
      error_description: 'Refresh token is bound to a resource this client may not target',
    });
  }
  return {
    scope: permittedScopes(client, token.scope).join(' '),
    resource: token.resource ?? undefined,
  };
}
