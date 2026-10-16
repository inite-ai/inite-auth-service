import type { OAuthClient } from '@prisma/client';

/**
 * Agents that exist on their own.
 *
 * An AI agent can register itself (RFC 7591) with its own key
 * (`private_key_jwt`, the public key inline in `jwks`) and the
 * `client_credentials` grant, with no person behind it. Such a client is an
 * agent in its own right: its tokens carry its did:web as `sub`, and the DID
 * document publishes its key, so anyone it pays or calls can check that a
 * signature is really the agent's. Billing opens a wallet whose only owner is
 * that key; a person funds it by sending to the address.
 *
 * Agents acting for a person (the `act` claim, AgentsService) stay as they are.
 */

const SELF_AGENT_ID = /^dcr_[0-9a-f]{32}$/;

/** did:web under the issuer: did:web:<host>[:path]:agents:<id> → <issuer>/agents/<id>/did.json. */
export function agentDid(issuer: string, agentId: string): string {
  const url = new URL(issuer);
  const host = url.port ? `${url.hostname}%3A${url.port}` : url.hostname;
  const path = url.pathname.replace(/^\/+|\/+$/g, '');
  return ['did:web', host, ...(path ? path.split('/') : []), 'agents', agentId].join(':');
}

export function isSelfAgentId(id: string): boolean {
  return SELF_AGENT_ID.test(id);
}

/** The public keys a self-registered agent signs with, from its registration. */
export function selfAgentKeys(client: Pick<OAuthClient, 'jwks'>): Array<Record<string, unknown>> {
  const jwks = client.jwks as { keys?: unknown } | null;
  const keys = Array.isArray(jwks?.keys) ? jwks.keys : [];
  return keys.filter(
    (k): k is Record<string, unknown> => !!k && typeof k === 'object' && typeof (k as { kty?: unknown }).kty === 'string',
  );
}

/**
 * A dynamically registered client that authenticates with its own inline key,
 * may use client_credentials and belongs to no company: an agent on its own.
 */
export function isSelfAgent(
  client: Pick<OAuthClient, 'clientId' | 'tokenEndpointAuthMethod' | 'allowedGrants' | 'companyId' | 'jwks'>,
): boolean {
  return (
    isSelfAgentId(client.clientId) &&
    client.tokenEndpointAuthMethod === 'private_key_jwt' &&
    (client.allowedGrants ?? []).includes('client_credentials') &&
    !client.companyId &&
    selfAgentKeys(client).length > 0
  );
}

/** The DID document of a self-registered agent: its keys, and the client it is. */
export function selfAgentDocument(
  issuer: string,
  client: Pick<OAuthClient, 'clientId' | 'name' | 'jwks'>,
): Record<string, unknown> {
  const id = agentDid(issuer, client.clientId);
  const methods = selfAgentKeys(client).map((jwk, i) => {
    const { d: _private, ...publicJwk } = jwk;
    return {
      id: `${id}#${typeof jwk.kid === 'string' ? jwk.kid : `key-${i + 1}`}`,
      type: 'JsonWebKey2020',
      controller: id,
      publicKeyJwk: publicJwk,
    };
  });
  return {
    '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/suites/jws-2020/v1'],
    id,
    controller: id,
    verificationMethod: methods,
    authentication: methods.map((m) => m.id),
    assertionMethod: methods.map((m) => m.id),
    service: [
      {
        id: `${id}#client`,
        type: 'OAuthClient',
        serviceEndpoint: { client_id: client.clientId, name: client.name },
      },
    ],
  };
}
