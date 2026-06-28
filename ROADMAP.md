# Roadmap

Where INITE Auth is headed, and the path to state-of-the-art (SOTA) parity with
the leading IdPs (Ory, Keycloak, Zitadel, Authentik, Auth0, WorkOS, Logto,
Stytch, Clerk, Supabase Auth).

This roadmap is **gap-driven**: it was built by inventorying what we already ship
against what those ten providers ship as of 2026. Effort tags: **S** (days),
**M** (1–2 weeks), **L** (3–6 weeks), **XL** (quarter+).

## Where we stand

Already shipped, and competitive or ahead on protocol depth:

- **OAuth2/OIDC core** — authorization_code + PKCE (S256 *enforced*), refresh-token
  rotation **with reuse/theft detection** (family revocation), client_credentials
  with audience binding, device flow (RFC 8628), PAR (RFC 9126), **DPoP (RFC 9449)**,
  revocation/introspection, discovery, RS256 JWKS, back-channel + front-channel logout.
  DPoP + PAR + theft-detection put us ahead of much of the field on the OSS side.
- **Auth methods** — passkeys/WebAuthn, magic links, email/password with
  exponential-backoff lockout, TOTP 2FA, backup codes, HIBP breach checks.
- **Web3-native identity** — `did:key` per user, SIWE (EIP-4361) + TON wallet
  linking, W3C Verifiable Credential issuance. *No major competitor matches this.*
- **Ops & multi-tenancy** — admin API + UI, per-client config, tenant-scoped audit
  log, Prometheus metrics, OpenTelemetry, health/ready, GDPR export/delete, client
  secret rotation with grace window.

The honest gaps below are mostly **breadth** (federation, enterprise B2B, DX
surface), not core-protocol correctness.

---

## P0 — Table-stakes parity (do first)

These are things essentially *every* competitor ships natively, including the OSS
ones. Closing them is what makes the project credible as a general-purpose IdP.

- **Social login / external IdP federation** (Google, GitHub, Microsoft, Apple,
  generic OIDC) — **L**. The single biggest gap: Ory/Kratos, Keycloak, Zitadel,
  Authentik, Logto all ship this free. Implement via Passport strategies + a
  generic OIDC connector + account linking (JIT). *Highest priority.*
- **OpenAPI / Swagger spec** — **S**. NestJS `@nestjs/swagger` over existing
  controllers. Unlocks client generation, docs, and DX parity. Low effort, high signal.
- **Email & SMS OTP as a login/2FA factor** — **M**. We have TOTP; add code-based
  email/SMS OTP (pluggable SMS provider, e.g. Twilio). Near-universal across the field.
- **WebAuthn conditional UI / passkey autofill** — **S–M**. We set autofill *hints*
  but don't do conditional mediation. Add `mediation: "conditional"` +
  `autocomplete="username webauthn"` in the login UI and advertise it. Default-on,
  like Stytch/Clerk. Leverages discoverable credentials we already request.
- **Step-up authentication enforcement** (RFC 9470) — **M**. We *capture* acr/amr
  but never enforce. Add an `acr_values` enforcement path + a resource-server
  `insufficient_user_authentication` challenge so RPs can demand re-auth.

## P1 — Enterprise / B2B breadth

What unlocks enterprise adoption. Notably, most competitors **paywall** several of
these (Ory/Logto gate SCIM+SAML behind Enterprise) — shipping them in OSS is a
genuine differentiator.

- **Organizations / teams + first-class RBAC** — **L**. We have flat roles; add an
  org/tenant model with per-org roles, membership, and delegated admin (Zitadel's
  Project-Grant model is the reference). Foundation for B2B SaaS customers.
- **SCIM 2.0 inbound provisioning** — **L**. User/group sync from Okta/Entra/Google.
  Paywalled by Ory & Logto; Zitadel's is preview/user-only. OSS SCIM is a real edge.
- **SAML 2.0 (SP + IdP)** — **L**. Accept enterprise SAML and issue assertions.
  Same paywall story as SCIM. Consider wrapping an existing lib over inventing it.
- **Audit-log export / SIEM streaming** — **M**. We have a queryable audit log; add
  bulk export (CSV/JSON) + webhook/stream to S3/HTTPS. Everyone treats turnkey SIEM
  streaming as Enterprise — a basic OSS exporter is welcome.
- **Multi-language SDKs + migration tooling** — **M each**. We ship TS/React;
  add Python and Go SDKs (generated from the OpenAPI spec) and an Auth0/Keycloak
  user-import path.
- **Self-service session/device management UI** — **S**. We have the session APIs
  and an admin view; add an end-user "your devices / active sessions" screen
  (competitors mostly leave this build-it-yourself).

## P1 — Developer experience (the #1 adoption lever)

Research finding: DX, not protocol depth, is what decides OSS-IdP adoption — and
it's our weakest area today.

- **OpenAPI / Swagger spec** — **S**. (Also listed P0 — it's that important.)
  `@nestjs/swagger` over existing controllers; unlocks client generation + docs.
- **`docker compose up` one-liner + official Helm chart** — **M**. Keycloak's
  `start-dev` is the gold standard; we have a compose file, polish it to truly
  zero-config and add a Helm chart for k8s self-hosters.
- **Migration tooling from Auth0 / Cognito / Firebase / Keycloak** — **L**. Bulk
  user import with **password-hash passthrough** (bcrypt/scrypt/argon2) is a major
  switching unlock — WorkOS's multi-source CLI is the reference.
- **Official Terraform provider** — **L**. Config-as-code (clients, scopes, settings)
  is expected for serious self-host/enterprise use.
- **Local dev / sandbox mode** — **M**. Seedable test instance + a "test mode" tenant
  so integrators can develop without touching prod data.
- **Per-framework quickstarts** — **M** ongoing. Next.js, React, Express, Python,
  Go — the Auth0/Clerk/Stytch docs bar.

## P2 — SOTA & differentiation

Where we can lead rather than follow, anchored on our two unique strengths:
**Web3-native identity** and **AI-agent / MCP authorization**.

- **Token Exchange (RFC 8693)** — **M**. Broadly supported (Ory, Zitadel, Keycloak
  GA, Auth0, Logto) and central to agent/MCP delegation. Add the
  `urn:ietf:params:oauth:grant-type:token-exchange` grant with `act`-claim delegation.
- **Rich Authorization Requests (RFC 9396)** — **L**. *Only Auth0 ships this in
  production.* MCP is pulling it forward for fine-grained agent permissions. Adding
  `authorization_details` (on top of our existing PAR) would put us in rare company.
- **OAuth for MCP / AI agents — the standout 2026 bet** — **M–L**. The MCP spec
  treats the MCP server as an OAuth resource server validating tokens from a
  separate authorization server — which is exactly what we are. We already have the
  hard parts (audience binding, DPoP, device flow). To be a drop-in MCP AS, add:
  - **RFC 8414** AS metadata at `/.well-known/oauth-authorization-server` — **S**
  - **RFC 7591/7592** Dynamic Client Registration (+ mgmt) — AI clients can't
    pre-register — **M**
  - **Client ID Metadata Documents (CIMD)** — URL-as-client_id, the 2025-11-25 MCP
    default — **M**
  - **RFC 8707** Resource Indicators — per-MCP-server audience-bound tokens (we have
    audience binding → just wire it) — **S**
  - **RFC 9728** Protected Resource Metadata + `WWW-Authenticate` 401 challenge helper — **S**
  - AI-friendly consent screen — **M**

  Then the differentiator tier: **token vault** (store/refresh third-party OAuth
  tokens on behalf of an agent, à la Auth0 Token Vault), **CIBA** (human-in-the-loop
  approval), and **ID-JAG / Cross-App Access** (IETF `draft-ietf-oauth-identity-
  assertion-authz-grant`) for enterprise agent delegation. Pairs with Token Exchange
  above. *This is the fastest-moving space and where our primitives already lead.*
- **OID4VP / OID4VCI 1.0 — Verifiable Credential *presentation*** — **L**. Both
  specs went **final 1.0 in 2025**; only Keycloak even ships VC issuance (experimental,
  on an old draft). We already issue VCs and DIDs — aligning to OID4VCI/OID4VP 1.0 so
  RPs can *request and verify* presentations would put us **ahead of the entire field**
  on decentralized identity (EUDI/eIDAS tailwind).
- **FAPI 2.0 profile** — **L** (+cert XL). Final since Feb 2025. We already have the
  primitives (PAR, PKCE, DPoP); shipping a FAPI 2.0 security profile (+ optional
  RFC 8705 mTLS) is a fintech-positioning play — no benchmark vendor is certified yet.
- **Fine-grained authorization (Zanzibar/ReBAC)** — **XL**. *Integrate* OpenFGA/
  SpiceDB rather than build; expose an **AuthZEN 1.0** PDP API (WorkOS FGA / Ory Keto
  are the references).
- **Adaptive / risk-based auth + bot protection** — **L**. Device fingerprinting,
  impossible-travel, CAPTCHA (Turnstile) on sign-up/login. Commercial CIAM's moat
  (Auth0, WorkOS Radar, Stytch); Authentik shows an OSS-composable version is feasible.
  Watch **DBSC** (device-bound session credentials, shipping in Chrome ~2026) for
  cookie binding — complements our DPoP.

## Infrastructure & tech-debt

- **Prisma 6 → 7** — **M**. Deferred during the dependency sweep: Prisma 7 moves the
  datasource `url` out of `schema.prisma` into `prisma.config.ts` and requires an
  adapter/Accelerate URL on the client. Needs a config migration + full test pass.
- **TypeScript 5 → 6** — **M**. Currently breaks `ts-jest`/jest typings (800+ errors);
  revisit once the toolchain (ts-jest, @types) supports TS 6 cleanly.
- **ESLint 9 → 10** — **S**. Blocked on `typescript-eslint` shipping ESLint 10 support;
  bump together when it lands.
- **Continue de-godifying** — the OAuth controller/service were split to pass the
  size/complexity gates; keep extracting per-grant/service logic as the surface grows.
- **HTTPS enforcement + automated key rotation** — **M**. Runtime HSTS/secure-cookie
  hardening is in place; add explicit prod HTTPS enforcement and an automated JWKS
  key-rotation schedule with **overlapping `kid`s** (we already publish `kid`) so
  rollover never invalidates in-flight tokens.
- **Secrets at rest + Vault/KMS hooks** — **M**. Client secrets are hashed; add
  encryption-at-rest for sensitive config and optional HashiCorp Vault / cloud-KMS
  integration (Keycloak's Vault SPI is the reference).
- **RFC 9700 self-audit** — **S**. Confirm we meet the finalized OAuth Security BCP
  (mandatory PKCE+S256 ✓, exact redirect match ✓, no implicit/ROPC ✓, refresh
  rotation/sender-constraining ✓) and document the compliance posture.

> **Note on GDPR:** export + hard-delete endpoints already ship (`/v1/auth/identity/
> export` and account deletion) — a gap in some competitors, not for us.

## How to contribute to the roadmap

Pick a P0/P1 item, open an issue describing the approach, and see
[CONTRIBUTING.md](CONTRIBUTING.md). Items tagged **S** make good first contributions
(OpenAPI spec, conditional-UI autofill, session UI).
