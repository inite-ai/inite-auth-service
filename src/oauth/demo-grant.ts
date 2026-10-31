import { BadRequestException } from '@nestjs/common';
import { DEMO_PERSONAS, type DemoPersona } from '../organizations/demo-tenant';

/**
 * The demo grant (family auth plan §4, owner decision 29.10.2026): a product's
 * backend, authenticated as itself, exchanges `demo:<persona>` for a read-only
 * access token of that persona in the «Atlântica Group (demo)» org. It rides
 * the RFC 8693 token-exchange grant with a subject_token_type of our own,
 * which no other code path accepts.
 *
 *   grant_type=urn:ietf:params:oauth:grant-type:token-exchange
 *   subject_token_type=urn:inite:params:oauth:token-type:demo-persona
 *   subject_token=demo:owner | demo:manager | demo:staff
 */
export const DEMO_SUBJECT_TOKEN_TYPE = 'urn:inite:params:oauth:token-type:demo-persona';

/** RFC 8693 §3: what the response says it issued. */
export const DEMO_ISSUED_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';

/** Two hours, and never refreshed: a visitor's demo ends with its token. */
export const DEMO_TOKEN_TTL_SECONDS = 2 * 60 * 60;

/**
 * Demo-grant buckets, on top of the token endpoint's own limit. Every
 * product backend calls from the family host, so the address bucket is
 * shared by all of them and is the wider one; the client bucket stops one
 * product (or one leaked secret) from minting demo tokens in a loop. The
 * per-visitor bucket lives in the product, in front of `/api/auth/demo`.
 */
export const DEMO_RATE_WINDOW_MS = 60_000;
export const DEMO_RATE_PER_CLIENT = 30;
export const DEMO_RATE_PER_IP = 60;

/** Is this token request the demo grant (and nothing else)? */
export function isDemoGrantRequest(body: unknown): boolean {
  const b = body as { grant_type?: unknown; subject_token_type?: unknown } | null | undefined;
  return (
    b?.grant_type === 'urn:ietf:params:oauth:grant-type:token-exchange' &&
    b?.subject_token_type === DEMO_SUBJECT_TOKEN_TYPE
  );
}

/** `demo:<key>` → the persona, or null for anything else. */
export function demoPersonaFor(subjectToken: unknown): DemoPersona | null {
  if (typeof subjectToken !== 'string' || !subjectToken.startsWith('demo:')) return null;
  const key = subjectToken.slice('demo:'.length);
  return DEMO_PERSONAS.find((p) => p.key === key) ?? null;
}

/**
 * The scope a demo token carries: `openid profile <product>:read`, whatever
 * the client asked for. The product is the client id without the family's
 * `inite-` prefix, dashes as underscores (`inite-estate` → `estate:read`,
 * `inite-fund` → `fund:read`, the convention the vertical scopes already
 * follow). `offline_access`, `email` and every write scope are never in it.
 * Null when the client id cannot name a scope.
 */
export function demoScopes(clientId: string): string[] | null {
  const product = clientId.replace(/^inite-/, '').replace(/-/g, '_');
  if (!/^[a-z][a-z0-9_]*$/.test(product)) return null;
  return ['openid', 'profile', `${product}:read`];
}

/**
 * RFC 6749 §5.2 errors, spec-exact and with no description: a caller probing
 * the grant learns only that it was refused, never which check refused it.
 */
export const demoInvalidGrant = (): BadRequestException =>
  new BadRequestException({ error: 'invalid_grant' });
export const demoUnauthorizedClient = (): BadRequestException =>
  new BadRequestException({ error: 'unauthorized_client' });

/** Why a demo grant was refused: audit and metrics only, never the response. */
export type DemoRefusal =
  | 'disabled'
  | 'client_not_first_party'
  | 'client_no_scope'
  | 'unknown_persona'
  | 'persona_not_demo';

/** A refusal carrying its audit reason and the bare RFC error to answer with. */
export class DemoRefused extends Error {
  constructor(
    readonly reason: DemoRefusal,
    readonly response: BadRequestException,
  ) {
    super(reason);
  }
}
