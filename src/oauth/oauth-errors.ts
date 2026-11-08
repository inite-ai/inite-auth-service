import { BadRequestException, HttpException } from '@nestjs/common';

/**
 * OAuth error bodies: `{ error, error_description }` with a registered code.
 *
 * RFC 6749 §5.2 (token), RFC 7591 §3.2.2 (registration) and RFC 6749
 * §4.1.2.1 (authorization) all define the same shape. Nest's default body
 * (`{ message, error: "Bad Request", statusCode }`) is not it: a client
 * parsing `error` reads "Bad Request", which is no code at all.
 */

/** RFC 7591 §3.2.2 registration error codes. */
export type DcrErrorCode =
  | 'invalid_redirect_uri'
  | 'invalid_client_metadata'
  | 'invalid_software_statement'
  | 'unapproved_software_statement';

/**
 * Nest names an exception with an object body after its class ("Bad Request
 * Exception"); keep the description as the message, for logs, audit rows and
 * anything that matches on it.
 */
function withMessage<E extends HttpException>(e: E, description: string): E {
  e.message = description;
  return e;
}

/** A 400 with an RFC 7591 §3.2.2 body. */
export function dcrError(code: DcrErrorCode, description: string): BadRequestException {
  return withMessage(
    new BadRequestException({ error: code, error_description: description }),
    description,
  );
}

/**
 * An OAuth code is lower-case ASCII with underscores. Nest's default
 * `error` is the HTTP reason phrase ("Bad Request"), so it never matches.
 */
const OAUTH_CODE = /^[a-z][a-z_]*$/;

/** True when a thrown body already carries an OAuth error code. */
export function isOAuthErrorBody(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const error = (body as { error?: unknown }).error;
  return typeof error === 'string' && OAUTH_CODE.test(error);
}

/** The human text of a Nest exception: its message, joined if a list. */
export function describeException(e: HttpException): string {
  const body = e.getResponse();
  if (typeof body === 'string') return body;
  const message = (body as { message?: unknown }).message;
  if (Array.isArray(message)) return message.map(String).join('; ');
  if (typeof message === 'string') return message;
  return e.message;
}

/** What an endpoint answers instead: the status and the code. */
export interface OAuthErrorMapping {
  status: number;
  error: string;
}

/**
 * Picks the code for a Nest exception that carries none. Returns null to
 * leave the exception untouched (rate limits, server errors).
 */
export type OAuthErrorMapper = (status: number, description: string) => OAuthErrorMapping | null;

const MESSAGE_RULES = {
  dpop: /^(DPoP proof|Malformed DPoP proof)/,
  unsupportedGrant: /^Unsupported grant_type$/,
  grantNotAllowed: /^Grant type ".*" is not allowed for this client$/,
  scope: /^(Scope\(s\) not allowed|No scopes available|Requested scope exceeds)/,
  target: /^(Resource|Audience) ".*" is not (allowed|a registered)/,
  grant: /authorization code|code verifier|is invalid or expired/i,
  responseType: /response_type/,
  requestUri: /^Invalid or expired request_uri$/,
  requestObject: /request object/,
} as const;

/** RFC 6749 §5.2, plus RFC 9449 (DPoP) and RFC 8707 (resource). */
export const tokenErrorMapper: OAuthErrorMapper = (status, description) => {
  // RFC 9449 §5: a bad proof is invalid_dpop_proof, a 400 — not a client
  // authentication failure, even where the DPoP service throws a 401.
  if (MESSAGE_RULES.dpop.test(description)) return { status: 400, error: 'invalid_dpop_proof' };
  if (status === 401) return { status: 401, error: 'invalid_client' };
  if (status !== 400) return null;
  if (MESSAGE_RULES.unsupportedGrant.test(description)) {
    return { status, error: 'unsupported_grant_type' };
  }
  if (MESSAGE_RULES.grantNotAllowed.test(description)) {
    return { status, error: 'unauthorized_client' };
  }
  if (MESSAGE_RULES.scope.test(description)) return { status, error: 'invalid_scope' };
  if (MESSAGE_RULES.target.test(description)) return { status, error: 'invalid_target' };
  if (MESSAGE_RULES.grant.test(description)) return { status, error: 'invalid_grant' };
  return { status, error: 'invalid_request' };
};

/**
 * RFC 6749 §4.1.2.1 codes for the errors /authorize answers directly (it
 * does not redirect them). Status is kept as thrown: an unknown client stays
 * a 401, everything else a 400.
 */
export const authorizeErrorMapper: OAuthErrorMapper = (status, description) => {
  if (status === 401) return { status, error: 'invalid_client' };
  if (status !== 400) return null;
  if (MESSAGE_RULES.responseType.test(description)) {
    return { status, error: 'unsupported_response_type' };
  }
  if (MESSAGE_RULES.grantNotAllowed.test(description)) {
    return { status, error: 'unauthorized_client' };
  }
  if (MESSAGE_RULES.target.test(description)) return { status, error: 'invalid_target' };
  if (MESSAGE_RULES.requestUri.test(description)) return { status, error: 'invalid_request_uri' };
  if (MESSAGE_RULES.requestObject.test(description)) {
    return { status, error: 'invalid_request_object' };
  }
  return { status, error: 'invalid_request' };
};

/**
 * RFC 7591 §3.2.2. The registry throws coded errors itself; this catches
 * what reaches registration from shared helpers (the jwks checks, also used
 * by the admin API, keep Nest's shape there).
 */
export const registerErrorMapper: OAuthErrorMapper = (status, description) => {
  if (status !== 400) return null;
  if (/redirect_uri/.test(description)) return { status, error: 'invalid_redirect_uri' };
  return { status, error: 'invalid_client_metadata' };
};

/**
 * The exception to throw instead of `e`, or `e` itself when it already
 * speaks OAuth or the mapper leaves it alone.
 */
export function toOAuthException(e: HttpException, mapper: OAuthErrorMapper): HttpException {
  if (isOAuthErrorBody(e.getResponse())) return e;
  const description = describeException(e);
  const mapped = mapper(e.getStatus(), description);
  if (!mapped) return e;
  return withMessage(
    new HttpException({ error: mapped.error, error_description: description }, mapped.status, {
      cause: e,
    }),
    description,
  );
}
