# RFC 9700 self-audit — OAuth 2.0 Security Best Current Practice

A checklist mapping the recommendations of [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)
(OAuth 2.0 Security BCP, Jan 2025) to this service's implementation. Status is
one of ✅ implemented · 🟡 partial · ⬜ gap (tracked). Evidence cites the
enforcing code. This is a read-only posture document — it surfaces gaps, it
does not fix them.

Last reviewed: 2026-07-07 (v1.5.0).

## 2.1 Protecting redirect-based flows

| # | Recommendation | Status | Evidence / note |
|---|----------------|--------|-----------------|
| 2.1 | Authorization code grant with PKCE for all clients (public **and** confidential) | ✅ | PKCE verified on every code exchange — `oauth.service.ts` `verifyCodeChallenge`. |
| 2.1.1 | PKCE `S256` required; `plain` rejected | ✅ | Non-S256 `code_challenge_method` is rejected at `/authorize` — `oauth.controller.ts:178`. Discovery advertises `code_challenge_methods_supported: ['S256']`. |
| 2.1 | Exact redirect-URI string matching (no wildcards/substrings) | ✅ | Allow-list exact match — `oauth-client-registry.service.ts:179` (`redirectUris.includes`). RFC 8252 §7.3 loopback-port exception is scoped to loopback hosts only (`:173`). |
| 2.1 | Authorization-response `iss` parameter to defend against mix-up (RFC 9207) | ⬜ | Not emitted on the authorization response. **Gap** — add `iss` to the `/authorize` redirect and advertise `authorization_response_iss_parameter_supported`. Low risk single-AS deployments, matters for multi-AS RPs. |
| 2.1 | Implicit grant / response_type=token not offered | ✅ | Only `response_types_supported: ['code']` — `health.controller.ts`. |
| 2.1 | `state` (or PKCE) for CSRF protection on the redirect | ✅ | `state` round-tripped through `/authorize` and consent; PKCE independently binds the code to the client. |

## 2.2 Token replay & sender-constraining

| # | Recommendation | Status | Evidence / note |
|---|----------------|--------|-----------------|
| 2.2 | Sender-constrained access tokens (DPoP or mTLS) available | ✅ | DPoP (RFC 9449) with `cnf.jkt` binding — `dpop.service.ts` — and mTLS certificate-bound tokens (RFC 8705) with `cnf["x5t#S256"]` — `mtls.service.ts`, behind `MTLS_ENABLED`. |
| 2.2.2 | Refresh-token rotation for public clients | ✅ | Every refresh rotates; the used token is revoked in the same transaction — `oauth-token-issuer.service.ts` `refreshAccessToken`. |
| 2.2.2 | Refresh-token replay / theft detection | ✅ | Replay of an already-revoked token revokes the whole family (RFC 6819 §5.2.2.3) — `oauth-token-issuer.service.ts:257`. Concurrent-rotation race is claimed atomically (`updateMany … revoked:false`). |
| 2.2 | Access tokens are short-lived | ✅ | User-flow access/id tokens ~10 min; M2M ~5 min (`JWT_M2M_ACCESS_TOKEN_EXPIRY`). |

## 2.3 Restricting access-token privilege

| # | Recommendation | Status | Evidence / note |
|---|----------------|--------|-----------------|
| 2.3 | Audience-restricted access tokens (resource indicators, RFC 8707) | ✅ | `resource` binds the access-token `aud` — `oauth-token-issuer.service.ts` (`GenerateTokensInput.audience`), forwarded through the interactive flow (v1.5.0). |
| 2.3 | Scope down to least privilege | ✅ | Client-credentials + token-exchange scopes bounded by `allowedScopes`; exchange can only narrow — `oauth-m2m.service.ts`. |

## 2.4 Client authentication

| # | Recommendation | Status | Evidence / note |
|---|----------------|--------|-----------------|
| 2.4 | Strong client authentication for confidential clients (`private_key_jwt` / mTLS preferred) | 🟡 | `client_secret_post` (bcrypt-hashed secrets, rotation with grace) implemented. `private_key_jwt` (RFC 7523) not yet offered — tracked; would raise the confidential-client bar and unblock FAPI. |
| 2.4 | No plaintext client secrets at rest | ✅ | Secrets bcrypt-hashed — `oauth-client-registry.service.ts`. |

## 2.5 Other recommendations

| # | Recommendation | Status | Evidence / note |
|---|----------------|--------|-----------------|
| 2.5 | No access tokens in query strings | ✅ | Tokens returned in JSON bodies / `Authorization` headers only. |
| 2.5 | TLS for all endpoints | 🟡 | Enforced at the proxy/deploy layer (Traefik); the app itself does not hard-require HTTPS. Deploy-time concern — documented in ENV-SETUP. |
| 2.5 | OIDC `nonce` bound to id_token | ✅ | `nonce` rides the id_token only — `oauth-token-issuer.service.ts:166`. |
| 2.5 | Signing-key rotation supported | ✅ | Overlapping-kid JWKS rotation — `jwks.service.ts`, `docs/KEY-ROTATION.md`. |

## 4. Attacks & countermeasures (spot checks)

| Attack (RFC 9700 §4) | Countermeasure | Status |
|----------------------|----------------|--------|
| 4.5 Authorization code injection | PKCE binding | ✅ |
| 4.1 Insufficient redirect-URI validation | Exact match + loopback-scoped exception | ✅ |
| 4.10 Mix-up | `iss` authz-response param (RFC 9207) | ⬜ (see 2.1) |
| 4.8 CSRF | `state` + PKCE | ✅ |
| 4.11 Access-token injection | Audience restriction (RFC 8707) + DPoP | ✅ |
| 4.13 Refresh-token theft | Rotation + family revocation | ✅ |
| 4.2 Open redirection | No unbounded redirect targets; exact redirect-URI allow-list | ✅ |

## Tracked follow-ups (gaps)

1. **`iss` authorization-response parameter (RFC 9207)** — mix-up defense for RPs
   talking to multiple ASes. Add the param to `/authorize` responses + advertise
   `authorization_response_iss_parameter_supported`.
2. **`private_key_jwt` client authentication (RFC 7523)** — stronger confidential-client
   auth; see the client-auth-depth workstream.
3. ~~**mTLS + certificate-bound tokens (RFC 8705)**~~ — ✅ shipped behind
   `MTLS_ENABLED`: `tls_client_auth` (PKI) + `self_signed_tls_client_auth` client
   auth and `cnf["x5t#S256"]` token binding — `mtls.service.ts`.
4. **App-level HTTPS enforcement** — currently proxy-terminated; a redirect-to-HTTPS
   guard would close the gap for direct-exposure deployments.

Everything else in RFC 9700's normative recommendations is implemented and
evidenced above.
