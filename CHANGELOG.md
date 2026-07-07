# Changelog

All notable changes to this project are documented here. Format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [SemVer](https://semver.org/).

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
