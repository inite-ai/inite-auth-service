# Changelog

All notable changes to this project are documented here. Format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [SemVer](https://semver.org/).

## [1.10.0](https://github.com/inite-ai/inite-auth-service/compare/inite-auth-service-v1.9.0...inite-auth-service-v1.10.0) (2026-07-17)


### Features

* **oauth:** brain-vertical integration — user identity, RAR E2E, agent policy channels ([#132](https://github.com/inite-ai/inite-auth-service/issues/132)) ([9b65e15](https://github.com/inite-ai/inite-auth-service/commit/9b65e15be3d05150ae1f10093fb9bc6b0f7d8f15))


### Bug Fixes

* **logging:** explicit newline replace ahead of the control-char sweep ([#135](https://github.com/inite-ai/inite-auth-service/issues/135)) ([57b3d5d](https://github.com/inite-ai/inite-auth-service/commit/57b3d5d6433f7a52c0779865c667c0fdd286b20d))
* **security:** CodeQL + Scorecard + dependency backlog sweep ([#134](https://github.com/inite-ai/inite-auth-service/issues/134)) ([63faa17](https://github.com/inite-ai/inite-auth-service/commit/63faa171789a85a65529680ca752dd984ec4cb13))

## [1.9.0](https://github.com/inite-ai/inite-auth-service/compare/inite-auth-service-v1.8.0...inite-auth-service-v1.9.0) (2026-07-11)


### Features

* **admin-ui:** SAML connections + runtime Settings admin sections ([#124](https://github.com/inite-ai/inite-auth-service/issues/124)) ([be5c803](https://github.com/inite-ai/inite-auth-service/commit/be5c80317275622a2afbeb422574344185721758))
* **admin-ui:** shared CopyButton + copy affordances + skeleton consistency ([#126](https://github.com/inite-ai/inite-auth-service/issues/126)) ([01e72fb](https://github.com/inite-ai/inite-auth-service/commit/01e72fb18452e3c5180c3dc3b21f5b1ddc70ae9e))
* **admin-ui:** Sheet focus-trap + unsaved-changes guard ([#125](https://github.com/inite-ai/inite-auth-service/issues/125)) ([b399d62](https://github.com/inite-ai/inite-auth-service/commit/b399d62c2d03be7bbd5dfe36340b558995969dda))
* **oauth:** mTLS client auth + certificate-bound tokens — RFC 8705 (behind MTLS_ENABLED) ([#117](https://github.com/inite-ai/inite-auth-service/issues/117)) ([526d5e0](https://github.com/inite-ai/inite-auth-service/commit/526d5e070c784025c9feafb999d026152ca793da))
* **oauth:** Rich Authorization Requests — RFC 9396 (behind RAR_ENABLED) ([#115](https://github.com/inite-ai/inite-auth-service/issues/115)) ([a410937](https://github.com/inite-ai/inite-auth-service/commit/a410937449c01064203ea736315986eb50c90c26))
* **saml:** ACS + session + signature-wrapping tests (RFC-adjacent SAML 2.0) ([#121](https://github.com/inite-ai/inite-auth-service/issues/121)) ([e4a6807](https://github.com/inite-ai/inite-auth-service/commit/e4a6807067526c6928935b278f548c9c20fa1835))
* **saml:** SAML 2.0 SP metadata + IdP connection provisioning (flagged) ([#120](https://github.com/inite-ai/inite-auth-service/issues/120)) ([2acd2ae](https://github.com/inite-ai/inite-auth-service/commit/2acd2ae8385ae664ae29ae0ddfb69fde9340a12c))
* **scim:** SCIM 2.0 Groups + discovery (RFC 7644, behind SCIM_ENABLED) ([#119](https://github.com/inite-ai/inite-auth-service/issues/119)) ([be5ea6f](https://github.com/inite-ai/inite-auth-service/commit/be5ea6ff0a0eac2b29816d91342a208774537804))
* **scim:** SCIM 2.0 Users provisioning at /scim/v2 (RFC 7644, flagged) ([#118](https://github.com/inite-ai/inite-auth-service/issues/118)) ([b669160](https://github.com/inite-ai/inite-auth-service/commit/b66916073e4f814fddb3d02c72e4e2a3516df1de))
* **settings:** DB-backed runtime settings store + admin API ([#123](https://github.com/inite-ai/inite-auth-service/issues/123)) ([4d1bbe7](https://github.com/inite-ai/inite-auth-service/commit/4d1bbe7f93e838c5d15004b3f0cf6ae8c4e61ef0))

## [1.8.0](https://github.com/inite-ai/inite-auth-service/compare/inite-auth-service-v1.7.0...inite-auth-service-v1.8.0) (2026-07-10)


### Features

* **admin-ui:** surface audit-log export + user revoke-sessions ([#110](https://github.com/inite-ai/inite-auth-service/issues/110)) ([92f9cb5](https://github.com/inite-ai/inite-auth-service/commit/92f9cb5ff31f219872ec143b7847a43b7526d99a))
* **audit:** sortable columns in the audit log (backend + UI) ([#114](https://github.com/inite-ai/inite-auth-service/issues/114)) ([52fd944](https://github.com/inite-ai/inite-auth-service/commit/52fd9443d903e150b659fa7b7dd52ad4f176f498))
* **orgs:** edit custom role permissions (backend + UI) ([#112](https://github.com/inite-ai/inite-auth-service/issues/112)) ([b6c93d5](https://github.com/inite-ai/inite-auth-service/commit/b6c93d5b9e9d51d1242c38b8052abb1ddf7f1655))
* **ssf:** enable/disable a stream without deleting it (backend + UI) ([#113](https://github.com/inite-ai/inite-auth-service/issues/113)) ([174ad05](https://github.com/inite-ai/inite-auth-service/commit/174ad0558e052612c7cf5039d926a2db9e021918))

## [1.7.0](https://github.com/inite-ai/inite-auth-service/compare/inite-auth-service-v1.6.0...inite-auth-service-v1.7.0) (2026-07-08)


### Features

* **admin-ui:** Federation connections section (E-frontend) ([b87773e](https://github.com/inite-ai/inite-auth-service/commit/b87773e46d17a87ca6414f1e1ba11179f17a6e90))
* **admin-ui:** OAuth client token-endpoint auth method (B) ([3c5ff98](https://github.com/inite-ai/inite-auth-service/commit/3c5ff985fc25ef0344205800381fa378a7a30870))
* **admin-ui:** Organizations & RBAC section (C) ([6ce3ed5](https://github.com/inite-ai/inite-auth-service/commit/6ce3ed5634d8c3f372f3f8709e4ddb8fe285c583))
* **admin-ui:** Organizations, Shared Signals, Connections tabs + client auth method + god-file gate ([c0dc3ef](https://github.com/inite-ai/inite-auth-service/commit/c0dc3ef81d3ff4348237a382d6ebec088dc21363))
* **admin-ui:** Shared Signals (SSF/CAEP) streams section (D) ([bba28e8](https://github.com/inite-ai/inite-auth-service/commit/bba28e8d40e7fa085ecd3b7a1c9a0de6ebaf7910))
* **admin:** accept token_endpoint_auth_method + jwks on admin client CRUD ([3d250f4](https://github.com/inite-ai/inite-auth-service/commit/3d250f48d926f732f78da028b5d21f9861e1b74a))
* **admin:** accept token_endpoint_auth_method + jwks on admin client CRUD ([cf484b0](https://github.com/inite-ai/inite-auth-service/commit/cf484b02375ead87b3cf84d1b498613a7f7e158d))
* **federation:** DB-backed provider config + admin CRUD (E-backend) ([2cc08ab](https://github.com/inite-ai/inite-auth-service/commit/2cc08ab1356c81ea490bcf3ab1d9fad72ec3c0b8))
* **federation:** DB-backed provider config + admin CRUD (E-backend) ([de5c66a](https://github.com/inite-ai/inite-auth-service/commit/de5c66a8478de8fe755ab6f5a0c8b804a7f68ee2))

## [1.6.0](https://github.com/inite-ai/inite-auth-service/compare/inite-auth-service-v1.5.0...inite-auth-service-v1.6.0) (2026-07-07)


### Features

* **jwks:** signing-key rotation with overlapping kids ([0de91aa](https://github.com/inite-ai/inite-auth-service/commit/0de91aa0bc6bd40f66f47ecd29ee950a643150bd))
* **jwks:** support signing-key rotation with overlapping kids ([57e4cab](https://github.com/inite-ai/inite-auth-service/commit/57e4cabc8e619479123d268a3fced0d971878538))
* **oauth:** private_key_jwt client auth (RFC 7523) + signed request objects (RFC 9101) ([acdd640](https://github.com/inite-ai/inite-auth-service/commit/acdd6407224b7878532ef62f609ac73a0785692e))
* **oauth:** private_key_jwt client auth (RFC 7523) + signed request objects (RFC 9101) ([b20a563](https://github.com/inite-ai/inite-auth-service/commit/b20a56319c0688e4b74081727b56d17f46820045))
* **rbac:** organizations, memberships & relational RBAC ([0b9ce60](https://github.com/inite-ai/inite-auth-service/commit/0b9ce60eed48fd2d15509dc4be203470c515e67d))
* **rbac:** organizations, memberships & relational RBAC ([8e1b560](https://github.com/inite-ai/inite-auth-service/commit/8e1b560fbe529f4c8b6d1238efdc3cfe08795449))
* **security:** encrypt TOTP 2FA secrets at rest (AES-256-GCM) ([825c7fd](https://github.com/inite-ai/inite-auth-service/commit/825c7fdf6b42ad8d88340c4923184726adc09962))
* **security:** encrypt TOTP 2FA secrets at rest (AES-256-GCM) ([daf8840](https://github.com/inite-ai/inite-auth-service/commit/daf88406147ee32d8f7f1cea4423e8a81689e1f8))
* **ssf:** CAEP / OpenID Shared Signals transmitter ([3851866](https://github.com/inite-ai/inite-auth-service/commit/38518664e7b64be8bba3718a76aa43a5bb644489))
* **ssf:** CAEP / OpenID Shared Signals transmitter ([aea0cf2](https://github.com/inite-ai/inite-auth-service/commit/aea0cf2d213dad88b22bf2185acb92f103d997c0))


### Bug Fixes

* **migration:** make 0015 org-role seed robust + idempotent ([eb0869f](https://github.com/inite-ai/inite-auth-service/commit/eb0869febdad0bcd48c497b4f47a6538d4096031))
* **migration:** make 0015 org-role seed robust + idempotent ([e2fd4d8](https://github.com/inite-ai/inite-auth-service/commit/e2fd4d8b27d8df3e93d4b52925d7b9e74ab6de18))
* **sessions:** correct revoke endpoint paths; add RFC 9700 self-audit ([89243ed](https://github.com/inite-ai/inite-auth-service/commit/89243edcbe2304ba9fc0b7fb1cf541d970a5d78d))
* **sessions:** correct revoke endpoint paths; add RFC 9700 self-audit ([e2e73fe](https://github.com/inite-ai/inite-auth-service/commit/e2e73fe4a773c7107d4efbc4953d29b826d67597))

## [1.5.0](https://github.com/inite-ai/inite-auth-service/compare/inite-auth-service-v1.4.0...inite-auth-service-v1.5.0) (2026-07-07)


### Features

* **frontend:** forward RFC 8707 resource through the interactive OAuth flow ([#81](https://github.com/inite-ai/inite-auth-service/issues/81)) ([03962e0](https://github.com/inite-ai/inite-auth-service/commit/03962e0e9c608936214661844451a66427bd0eae))
* **oauth:** reaper for stale unused DCR clients (anti-abuse) ([#83](https://github.com/inite-ai/inite-auth-service/issues/83)) ([f02924c](https://github.com/inite-ai/inite-auth-service/commit/f02924c2f448a345ee77df27c5d21165177a7250))

## [1.4.0](https://github.com/inite-ai/inite-auth-service/compare/inite-auth-service-v1.3.0...inite-auth-service-v1.4.0) (2026-07-07)


### Features

* **auth:** Sign-In With Ethereum (EIP-4361) wallet login ([#71](https://github.com/inite-ai/inite-auth-service/issues/71)) ([b60ee57](https://github.com/inite-ai/inite-auth-service/commit/b60ee57ad085ddee5b168b9bc45d6813ca265d2e))
* **frontend:** step-up MFA "enter code" widget (P0-5 follow-up) ([#67](https://github.com/inite-ai/inite-auth-service/issues/67)) ([2066810](https://github.com/inite-ai/inite-auth-service/commit/206681098d128e2b2c6392f60d877e8445c1f9be))
* **oauth:** OAuth-for-MCP bundle — RFC 8414 + 9728 metadata + RFC 7591 DCR ([#68](https://github.com/inite-ai/inite-auth-service/issues/68)) ([91943d4](https://github.com/inite-ai/inite-auth-service/commit/91943d417db28c941f50e09e1bd854e109d52bab))
* **oauth:** RFC 8707 Resource Indicators for authorization_code ([#72](https://github.com/inite-ai/inite-auth-service/issues/72)) ([c6d6f5c](https://github.com/inite-ai/inite-auth-service/commit/c6d6f5cc7dff9afb9e1efef6a760fbbd0983c959))
* Token Exchange (RFC 8693) + max-lines:300 gate + god-file splits ([#49](https://github.com/inite-ai/inite-auth-service/issues/49)) ([2413ab8](https://github.com/inite-ai/inite-auth-service/commit/2413ab83308b1548ee9d0a5697b8c54416cd79a7))

## [1.3.0](https://github.com/inite-ai/inite-auth-service/compare/inite-auth-service-v1.2.0...inite-auth-service-v1.3.0) (2026-06-28)


### Features

* **frontend:** email OTP login method (completes P0-5 UI) ([#47](https://github.com/inite-ai/inite-auth-service/issues/47)) ([e915d00](https://github.com/inite-ai/inite-auth-service/commit/e915d00dd28106f202c440c268c285faa990b007))

## [1.2.0](https://github.com/inite-ai/inite-auth-service/compare/inite-auth-service-v1.1.0...inite-auth-service-v1.2.0) (2026-06-28)


### Features

* P0 SOTA floor — federation, OTP, step-up, audit export + strict gates + dep-security patches ([#44](https://github.com/inite-ai/inite-auth-service/issues/44)) ([5fe9e12](https://github.com/inite-ai/inite-auth-service/commit/5fe9e125042524eae0fae0229e993e3c31367495))


### Bug Fixes

* **ci:** run gitleaks via CLI and make dependabot titles conventional ([a648b54](https://github.com/inite-ai/inite-auth-service/commit/a648b54dcea8710291f1a3ff5a981b872cb4a316))

## [1.1.0] — 2026-05-20

### Added

- **OAuth 2.0 Device Authorization Grant (RFC 8628)** — new endpoints
  `POST /v1/oauth/device_authorization`, `GET /v1/oauth/device`,
  `POST /v1/oauth/device/approve`; new grant
  `urn:ietf:params:oauth:grant-type:device_code` on `/v1/oauth/token`.
- **Pushed Authorization Requests (RFC 9126)** — new endpoint
  `POST /v1/oauth/par`; `/v1/oauth/authorize` accepts `request_uri`.
- **DPoP sender-constrained tokens (RFC 9449)** — `client_credentials`
  grant accepts a `DPoP` proof header and binds `cnf.jkt` into the
  access token; `token_type` flips to `"DPoP"`.
- **OIDC Back-Channel Logout** —
  `OAuthClient.backchannelLogoutUri`; `/v1/oauth/logout` fans out
  signed `logout_token`s. Discovery doc advertises
  `backchannel_logout_supported`.
- **ACR/AMR step-up** — `/v1/oauth/authorize` accepts `acr_values`;
  login handlers tag the session AMR (`pwd`, `magic-link`, `fido`);
  `id_token` carries `amr` + `acr`, survives refresh rotation.
- **HIBP password breach check** — opt-in via `HIBP_ENABLED=true`,
  applied to register / reset paths via k-anonymity range API.
- **Idempotency-Key** — interceptor on `/v1/oauth/token` and
  `/v1/oauth/par`. Duplicate retries within 24 h return the cached
  response; same key + different body returns 400.
- **Prometheus `/metrics`** — token issue/fail counters,
  latency histogram by grant, auth attempts, lockouts, audit-log
  write failures, default node runtime metrics.
- **OpenTelemetry tracing** — opt-in via
  `OTEL_EXPORTER_OTLP_ENDPOINT`. Auto-instrumentations for
  http/express/pg/redis. Graceful flush on SIGTERM.
- **Correlation IDs** — `RequestContextMiddleware` propagates
  `X-Request-Id` (or generates UUID) through AsyncLocalStorage so
  every log line and audit row carries it.
- **Tenant isolation** — `companyId` denormalised onto
  `oauth_audit_log` / `refresh_tokens` / `authorization_codes`.
  `GET /v1/admin/audit-log` with scope helper: superadmin sees all
  tenants, scoped admins only their `companyId`.
- **Account lockout** — `User.failedLoginCount` + `lockoutUntil`,
  exponential backoff from the 5th miss (1m → 5m → 15m → 1h → 24h).
- **Per-account login throttler** — `LoginEmailThrottlerGuard` keys
  on lowercased email so credential-stuffing across IPs hits a
  single bucket per victim.
- **Client-secret rotation with grace window** —
  `OAuthClient.previousSecretHash` + `previousSecretExpiresAt`.
  `POST /v1/admin/oauth-clients/:id/rotate-secret` accepts
  `{graceWindowSeconds, force}` (default 24 h, cap 7 d).
- **OIDC nonce binding** — `AuthorizationCode.nonce` +
  `RefreshToken.nonce`; embedded into `id_token`, survives refresh.
- **OAuth audit log** — durable `oauth_audit_log` table covering
  token issuance / failures / client lifecycle / secret rotation.
  Required for compliance forensics independent of container logs.
- **Readiness probe** — `GET /ready` pings DB + Redis, 503 on
  degraded; `GET /health` stays a no-dependency liveness probe.
- **Graceful shutdown** — `enableShutdownHooks()` + SIGTERM/SIGINT
  handlers for the session-store Redis client.
- **WebAuthn attestation** — default upgraded from `'none'` to
  `'direct'`; configurable via `WEBAUTHN_ATTESTATION_TYPE`.

### Changed

- **URI versioning**: all app endpoints moved to `/v1/...`.
  `/.well-known/*`, `/health`, `/ready`, `/metrics` stay neutral.
  OIDC discovery doc updated.
- **JWT crypto-agility**: production hard-fails when
  `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` missing — silent HS256
  fallback removed. Explicit `algorithms` allow-list on both sign
  and verify paths blocks alg-confusion and `none` attacks.
- **`oauth_clients`**: `companyId`, `allowedAudiences`,
  `allowedGrants`, `previousSecretHash`,
  `previousSecretExpiresAt`, `backchannelLogoutUri` columns added.
- **`authorization_codes`**: `companyId`, `nonce`, `acrValues`,
  `amr` columns added.
- **`refresh_tokens`**: `companyId`, `nonce`, `amr` columns added.

### Migrations

- `0006_user_account_lockout`
- `0007_oauth_nonce_and_secret_rotation`
- `0008_tenant_isolation_companyid`
- `0009_oidc_backchannel_acr`
- `0010_device_authorization`

All additive. Backfills (where present) are idempotent.

### Breaking

- All non-spec endpoints now live under `/v1`. Spec endpoints
  (`/.well-known/openid-configuration` etc.) unchanged. RPs that
  hard-coded `/oauth/...` will 404 — point them at the discovery
  doc, which now advertises `/v1/oauth/...`.

## [1.0.0] — 2026-03-17

Initial release.
