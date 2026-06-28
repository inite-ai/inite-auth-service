import { OAuthClient } from '@prisma/client';

/** Input contract for OAuthService.exchangeToken (RFC 8693). */
export interface TokenExchangeInput {
  /** The authenticated calling client (the actor / requesting party). */
  client: OAuthClient;
  /** The token presented for exchange (we only accept our own signed JWTs). */
  subjectToken: string;
  subjectTokenType: string;
  /** Optional acting-party token for delegation chains. */
  actorToken?: string;
  actorTokenType?: string;
  /** Requested scope (space-delimited); must not exceed the subject's. */
  requestedScope?: string;
  /** RFC 8707 target resource / audience for the issued token. */
  resource?: string;
  audience?: string;
}
