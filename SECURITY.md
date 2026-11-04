# Security model + known limitations

This service is the identity provider for the INITE ecosystem.
Anything that lands here — user sessions, OAuth tokens, machine-to-
machine credentials — is sensitive. The list below is the running
ledger of security-relevant features that ship today and the
properties we know we have NOT yet bought.

## What ships today

| Surface | Status |
|---|---|
| Helmet CSP / HSTS / X-Frame / Referrer-Policy | ✓ on `/` |
| RS256 JWT signing via JWKS (`auth-rs256-key-1`) | ✓ |
| HS256 fallback when `JWT_PRIVATE_KEY` unset | dev only |
| Refresh-token rotation + theft detection | ✓ (auto-revoke family; 30 s reuse grace for concurrent refreshes, below) |
| HMAC'd refresh-token lookup (O(1), no bcrypt scan) | ✓ |
| PKCE on authorization_code | ✓ (mandatory) |
| Per-route throttling | ✓ |
| Per-client throttling on `/oauth/token` | ✓ (token-throttler.guard) |
| `client.active` enforced at validate-time | ✓ |
| Audience binding via `allowedAudiences` per client | ✓ |
| Durable audit log (`oauth_audit_log`) | ✓ |
| M2M JWT TTL ≤5min (revocation window) | ✓ (`JWT_M2M_ACCESS_TOKEN_EXPIRY`) |
| Constant-time client lookup (bcrypt-equalised) | ✓ |
| Token introspection (RFC 7662) | ✓ |
| AdminGuard + role-gated admin endpoints | ✓ |
| Webauthn / passkey primary auth | ✓ |
| Magic-link + password fallback | ✓ |
| 2FA TOTP | ✓ |
| GDPR delete cascade (user→sessions+tokens+passkeys+wallets) | ✓ |
| Audit-log export (CSV/JSON) + signed webhook sink | ✓ |

## Per-endpoint rate limits

Global default is 60 req/min/IP (`ThrottlerModule`). Sensitive endpoints
tighten this with an explicit `@Throttle` (per-IP unless noted):

| Endpoint | Limit |
|---|---|
| `GET /v1/oauth/authorize` | 20 / min |
| `POST /v1/oauth/token` | per-client (token-throttler.guard) + per-client_id guard |
| `POST /v1/oauth/par` | 60 / min |
| `POST /v1/oauth/device_authorization` | 30 / min |
| `POST /v1/oauth/device/approve` | 10 / min |
| `POST /v1/auth/otp/request` · `mfa/request` | 5 / min (+ email throttler guard) |
| `POST /v1/auth/otp/verify` · `mfa/verify` | 10 / min |
| `GET /v1/auth/oauth/:provider/{start,callback}` | 20 / min |
| `POST /v1/auth/password/reset-request` | login-email throttler guard |
| `GET /v1/auth/security/audit` | 20 / min |

Password login additionally enforces per-account lockout with exponential
backoff (1m → 5m → 15m → 1h → 24h) after 5 consecutive failures.

## Refresh-token reuse grace

Every refresh rotates the refresh token; presenting a revoked one is
treated as theft and revokes every live refresh token of that user for
that client (RFC 6819 §5.2.2.3). Several processes sharing one sign-in
(CLI agents, IDE plugins, parallel sessions) refresh at the same moment,
and the loser presents a token revoked a moment ago. RFC 9700 §4.14.2
allows a short grace for such concurrent requests, and we take it:

- Within `REFRESH_REUSE_GRACE` of the rotation (default 30 s, `0` = off,
  at most 60 s; Admin → Settings → Tokens), the **same client**
  presenting an unexpired token revoked **by rotation**, whose rotation
  chain still reaches a live token within 5 hops, gets a sibling pair
  minted from the presented token: same grant, scope (narrowed to what
  the client may hold today) and bound resource. The newest token is not
  rotated.
- The cap is **per sign-in family** (every token rotated or minted from
  one sign-in): at most 3 siblings over the family's life. A sibling,
  and every token rotated from one, is never eligible for grace itself,
  so a replayed sibling is theft. Without both rules one stolen token
  could be replayed, each sibling rotated and replayed again, fanning out
  into unlimited live sessions; with them a family holds at most 1 + 3
  live tokens however it is replayed.
- The live token is claimed (row lock) while a sibling is inserted, so
  concurrent replays in one family are counted one after another and
  cannot exceed the cap, and a family revoke that locked it first makes
  the grace refuse.
- Another client's token is refused (`invalid_grant`) as before. After
  the window, past the cap, for an expired token, or once the family's
  newest token was revoked (theft, logout, or `/oauth/revoke` of that
  token), a replay is theft as before. Revoking one sibling with
  `/oauth/revoke` ends that sibling's line only; the rest of the family
  keeps whatever grace it has left under the cap.
- Grace replays are logged and audited (`token.refreshed.grace_replay`),
  and so is the theft branch (`token.failed.refresh_reuse`).

**Risk accepted:** an attacker who replays a stolen refresh token within
the window of its rotation, with the client's credentials (public
clients have none), gets a sibling instead of triggering the family
revoke. Bounded by the window and by 3 siblings per sign-in family, none
of which can mint more; outside them detection is unchanged.

**Residual race (not new):** a family revoke (theft branch, logout)
whose statement starts while a rotation or grace insert is in flight, after
that transaction took its lock, does not see the row being inserted, and
the new token survives the revoke. Rotation had this race before the
grace existed; the tip claim narrows it for siblings but does not close
it. Closing it needs the revoke side to lock the family first.

## Known limitations (SOTA gaps)

Items below are tracked but not blocked. Open an issue or pull
request when one becomes pressing — the rationale is captured here
so future operators don't re-derive it.

### 1. DPoP / sender-constrained tokens (RFC 9449)

**Status:** Not implemented.
**Risk:** A leaked bearer JWT is usable until expiry by anyone who
intercepts it (TLS termination logs, MITM proxies, browser
extensions, etc.). DPoP binds the token to a client-held key via a
`cnf` claim; the holder must sign each request with that key.
**Why deferred:** Heavy lift on both sides — auth-service must
validate DPoP-proof headers, every downstream service (brain,
inbox, …) must enforce the binding. A short JWT TTL plus audience
binding bounds the damage today. The user access-token TTL is
configurable (`JWT_ACCESS_TOKEN_EXPIRY`, Admin → Settings → Tokens):
10 minutes by default. INITE's own deployment will run 1 hour once the
refresh reuse grace has shipped (#287); a leaked user bearer token is
then usable for up to an hour. `expires_in` reports the configured TTL.
**Trigger to ship:** when we onboard a tenant where bearer-token
theft would breach fiduciary / health-data regulations.

### 2. Token revocation cache for M2M JWTs

**Status:** Not implemented.
**Risk:** If a machine client's secret leaks AND the operator
rotates it via the admin UI, the OLD JWT remains valid until its
exp: up to the M2M TTL (`JWT_M2M_ACCESS_TOKEN_EXPIRY`, 5 minutes by
default). User-flow tokens revoked at sign-out likewise live until
their exp: up to `JWT_ACCESS_TOKEN_EXPIRY`, 10 minutes by default (1 hour
on INITE's deployment once #287 has shipped). During that window, an attacker who
already holds the JWT keeps full access.
**Why deferred:** Token TTLs are short and configurable, so the
exposure window is bounded. A Redis-backed jti revocation list
that introspection callers check would close the gap, but adds a
hot dependency and per-request latency.
**Trigger to ship:** when the threat model includes
secret-leak-then-rotation as a recovery procedure (currently we
assume the JWT itself is recoverable via TTL drain).

### 3. Outbox / retry queue for cross-service cascades

**Status:** Not implemented (callers swallow failures + log).
**Risk:** When `smar-chat-backend` calls `brain.forgetEntity()`
after a user account deletion, a transient brain outage leaves
orphan facts. The local delete is committed; the cascade isn't
retried automatically.
**Why deferred:** Compliance can be satisfied by the `gdpr_forget_log`
audit table — operators query failing rows and re-run cleanup
manually. A persistent outbox + retry worker is correct
architecture but a larger build.
**Trigger to ship:** when a regulator demands automated
remediation evidence for failed GDPR cascades.

### 4. Token-provider cache invalidation on secret rotation

**Status:** Not implemented (callers see staleness until token TTL).
**Risk:** When an operator rotates a machine client's secret, every
backend instance that holds a cached JWT keeps using the old one
until expiry. Not a security risk (old JWT is still validly signed),
but a developer-experience pitfall during incident response.
**Why deferred:** Same short-TTL argument as #2. A Redis pub/sub
channel announcing rotations would let SDK clients invalidate
in-process caches instantly, at the cost of a Redis dependency.
**Trigger to ship:** when rotation latency becomes operationally
painful.

### 5. Constant-time client lookup

**Status:** ✓ Shipped. `validateClient` pays one dummy `bcrypt.compare`
on the no-client-found path so response time matches the
wrong-secret path — see `TIMING_DUMMY_HASH` in `oauth.service.ts`.
An attacker can no longer enumerate valid `client_id` values via
response-time deltas.

## Reporting

Security disclosures: security@inite.ai (PGP key available on
request). Coordinated disclosure window: 90 days from
acknowledgement, extendable on mutual agreement.
