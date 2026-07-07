/**
 * CAEP / RISC event-type URIs (OpenID Shared Signals Framework). Used as the
 * key in a SET's `events` claim and as the subscription identifier on a stream.
 */
export const CAEP_EVENTS = {
  sessionRevoked: 'https://schemas.openid.net/secevent/caep/event-type/session-revoked',
  credentialChange: 'https://schemas.openid.net/secevent/caep/event-type/credential-change',
  tokenClaimsChange: 'https://schemas.openid.net/secevent/caep/event-type/token-claims-change',
  accountDisabled: 'https://schemas.openid.net/secevent/risc/event-type/account-disabled',
} as const;

export type CaepEventType = (typeof CAEP_EVENTS)[keyof typeof CAEP_EVENTS];

export const ALL_CAEP_EVENTS: string[] = Object.values(CAEP_EVENTS);

/** SSF stream verification event (RFC-adjacent OpenID SSF). */
export const SSF_VERIFICATION_EVENT =
  'https://schemas.openid.net/secevent/ssf/event-type/verification';
