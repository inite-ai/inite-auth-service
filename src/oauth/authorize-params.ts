import { AuthorizeQuery, ResolvedAuthorizeParams } from './dto/oauth-requests';
import { ParPayload } from './par.service';
import { normalizeLoginHint } from './login-hint';
import { normalizeCustomerMarker, normalizeOrganizationHint } from './customer-lane';

/** The pure half of /authorize param resolution (oauth.controller.ts holds the I/O half). */

/** Map the raw query to normalized params (before any PAR override). */
export function queryToParams(q: AuthorizeQuery): ResolvedAuthorizeParams {
  return {
    responseType: q.response_type,
    clientId: q.client_id ?? '',
    redirectUri: q.redirect_uri ?? '',
    scope: q.scope,
    state: q.state,
    codeChallenge: q.code_challenge,
    codeChallengeMethod: q.code_challenge_method,
    nonce: q.nonce,
    acrValues: q.acr_values,
    prompt: q.prompt,
    // RFC 8707 Resource Indicator.
    resource: q.resource,
    // RFC 9396 — raw JSON, validated at code creation.
    authorizationDetails: q.authorization_details,
    // OIDC ui_locales — only ever shown to the login/consent UI.
    uiLocales: q.ui_locales,
    // OIDC login_hint — dropped unless it looks like an email; prefill only.
    loginHint: normalizeLoginHint(q.login_hint),
    // The org hint — only a customer-lane client acts on it.
    organization: normalizeOrganizationHint(q.organization),
    // The customer-lane marker: '1' or nothing.
    customer: normalizeCustomerMarker(q.customer),
  };
}

/**
 * RFC 9126 §4: pushed values take over the inbound query.
 *
 * Merged generically rather than field by field. ParPayload's keys are the
 * ResolvedAuthorizeParams keys, so a param added to the pushed request is
 * carried through on its own — this used to be a hand-written list, and
 * `resource` never made it onto that list, which is how an RFC 8707
 * indicator pushed out-of-band was dropped before it could bind the
 * audience. `undefined` entries are stripped so a param the client did not
 * push falls back to the query copy instead of blanking it.
 */
export function mergePushed(
  base: ResolvedAuthorizeParams,
  pushed: ParPayload,
): ResolvedAuthorizeParams {
  const defined = Object.fromEntries(
    Object.entries(pushed).filter(([, value]) => value !== undefined),
  ) as Partial<ResolvedAuthorizeParams>;
  // redirectUri stays authoritative even if blank — par.push already 400s on
  // a missing one, so an empty value here can only mean a tampered payload.
  return { ...base, ...defined, redirectUri: pushed.redirectUri };
}
