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

## P2 — SOTA & differentiation

Where we can lead rather than follow, anchored on our two unique strengths:
**Web3-native identity** and **AI-agent / MCP authorization**.

- **Token Exchange (RFC 8693)** — **M**. Broadly supported (Ory, Zitadel, Keycloak
  GA, Auth0, Logto) and central to agent/MCP delegation. Add the
  `urn:ietf:params:oauth:grant-type:token-exchange` grant with `act`-claim delegation.
- **Rich Authorization Requests (RFC 9396)** — **L**. *Only Auth0 ships this in
  production.* MCP is pulling it forward for fine-grained agent permissions. Adding
  `authorization_details` (on top of our existing PAR) would put us in rare company.
- **OAuth for MCP / AI agents** — **M**. Package our OAuth 2.1 surface as a
  first-class "authorize an AI agent" flow (the use case driving WorkOS/Supabase/
  Stytch). We already expose an MCP login endpoint; formalize scopes + consent for agents.
- **OID4VP — Verifiable Credential *presentation*** — **L**. We *issue* VCs; add
  OpenID for Verifiable Presentations so RPs can *request and verify* them. Closes
  the loop on the decentralized-identity story no competitor has.
- **Fine-grained authorization (Zanzibar/OpenFGA-style)** — **XL**. Relationship-based
  permissions as an optional decision layer (WorkOS FGA / Ory Keto are the references).
- **Adaptive / risk-based auth + bot protection** — **L**. Device fingerprinting,
  impossible-travel, CAPTCHA (Turnstile) on sign-up/login. Commercial CIAM's moat;
  Authentik shows an OSS-composable version is feasible.

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
  hardening is in place; add explicit prod HTTPS enforcement and a JWKS key-rotation
  schedule (overlapping keys via the `kid` we already publish).

## How to contribute to the roadmap

Pick a P0/P1 item, open an issue describing the approach, and see
[CONTRIBUTING.md](CONTRIBUTING.md). Items tagged **S** make good first contributions
(OpenAPI spec, conditional-UI autofill, session UI).
