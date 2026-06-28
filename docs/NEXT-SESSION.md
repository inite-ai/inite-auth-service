# Next session plan — toward SOTA

Tactical companion to [ROADMAP.md](../ROADMAP.md). This is the ordered, executable
plan for the next working session(s): what to build, in what order, with acceptance
criteria. Strategy & full gap analysis live in ROADMAP.md.

## Resume context (where we are)

- Repo is **public** (`inite-ai/inite-auth-service`), AGPL-3.0 + commercial, CI green.
- Single clean release history; old pre-OSS history preserved locally on branch
  `pre-oss-backup` (not pushed).
- Stack: NestJS 11, Prisma 6 (Postgres), Redis, Node 22. 196 tests, ESLint flat-config
  with brain-style size/complexity gates (0 errors). Gates: ci, codeql, dependency-review,
  scorecard, gitleaks (CLI), pr-title, release-please, ai-* — all wired.
- Already shipped & competitive: PKCE(S256), refresh rotation + theft detection,
  client_credentials + audience, device flow, PAR, DPoP, back/front-channel logout,
  passkeys, TOTP + backup codes, magic links, SIWE/TON, DIDs + VC issuance, admin UI,
  audit log, metrics/OTel, GDPR export/delete, session mgmt.
- **Working convention:** every push to `main` triggers the prod deploy (`deploy.yml`,
  self-hosted runner). Batch commits; expect a deploy per push.

## Progress — P0 floor SHIPPED (2026-06-28)

All quick wins + P0 core (items 1–7) landed, build/lint(0 errors)/223 tests green:
- ✅ OpenAPI/Swagger at `/docs` + `/openapi.json`
- ✅ Dockerfile node 22 + `docker compose up` one-liner (`POSTGRES_PASSWORD` in `.env.example`)
- ✅ WebAuthn conditional-UI autofill (+ fixed a latent v13 `{optionsJSON}` bug)
- ✅ Social login federation — Google / GitHub / generic OIDC (`src/auth/federation`, `oauth_identity`, JIT+link+collision guard)
- ✅ Email & SMS OTP factor (login + step-up; Twilio pluggable, `src/auth/otp`)
- ✅ Step-up enforcement RFC 9470 (`StepUpService`, acr/AAL on `/authorize` + `create-code`, resource-server challenge helper)
- ✅ Audit export CSV/JSON + signed webhook sink + documented per-endpoint rate limits (SECURITY.md)

Also: **strict ESLint gates** per review — `max-params:3`, `complexity:12`; new code
uses options objects + one-contract-per-file; only NestJS DI ctors / route handlers
carry documented disables; legacy carries `TODO(par-max)`/`TODO(complexity)`.

**Follow-ups for next session:**
- ✅ Frontend OTP login method shipped (`OtpAuth.tsx`, wired into AuthPage). Still
  TODO: a step-up "enter code" widget driving `/v1/auth/otp/mfa/*` for the RFC 9470
  re-auth flow (today step-up is satisfied by re-auth with a stronger method).
- Pay down the ~33 legacy `TODO(par-max)`/`TODO(complexity)` disables (options objects / decompose).
- Differentiators (items 8–9): OAuth-for-MCP bundle, Token Exchange (RFC 8693).
- Infra debt: Prisma 7, TS 6, ESLint 10.
- Released as v1.2.0; remaining dev-only `js-yaml` (jest 3.x coverage tooling) advisory accepted.

## Session goal

Close the **P0 credibility floor** + bank quick wins. Target order below is by
ROI-per-effort. Keep `npm run build && npm test && npm run lint` green after each item;
commit per item (conventional title), push in batches.

---

## Quick wins (do first — all S, high signal)

1. **OpenAPI / Swagger spec** — `@nestjs/swagger`.
   - Add `DocumentBuilder` + `SwaggerModule` in `src/main.ts`; serve at `/docs`,
     emit `openapi.json`. Add `@ApiTags`/`@ApiOperation` to controllers incrementally.
   - **Accept:** `/docs` renders; `openapi.json` validates; README "API" section links it.
2. **Dockerfile `node:20-alpine` → `node:22-alpine`** + compose polish.
   - Aligns base image with the Node 22 we target/CI; closes the dependabot noise.
   - **Accept:** `docker build` green in CI; `docker compose up` boots from a fresh
     `cp .env.example .env` with zero edits for local dev.
3. **WebAuthn conditional UI / passkey autofill** — frontend.
   - In the login form: `autocomplete="username webauthn"` + a
     `navigator.credentials.get({ mediation: 'conditional' })` path gated on
     `isConditionalMediationAvailable()`; we already request discoverable creds.
   - **Accept:** passkeys surface in the browser autofill dropdown on a supporting browser.

## P0 core (the real gaps)

4. **Social login / external IdP federation** — *biggest gap; every competitor has it.*
   - Add Passport strategies: Google + GitHub first, then a **generic OIDC** connector.
   - New `src/auth/federation/` module; `oauth_identity` table linking provider+subject
     → user (account linking / JIT create). Reuse DID issuance on first login.
   - Endpoints: `/v1/auth/oauth/:provider/{start,callback}`.
   - **Accept:** end-to-end Google + GitHub login creates/links a user and issues tokens;
     tests for new-user JIT + existing-user link + email-collision handling.
5. **Email & SMS OTP as a factor** — code-based, reuse email infra.
   - Email OTP first (we have SMTP); pluggable SMS provider interface (Twilio impl) behind it.
   - **Accept:** request-code + verify-code login and 2nd-factor paths, with rate limits + lockout.
6. **Step-up authentication enforcement (RFC 9470)** — we capture acr/amr but don't enforce.
   - Enforce `acr_values` on `/authorize`; add a resource-server
     `insufficient_user_authentication` 401 challenge helper.
   - **Accept:** an RP requesting `acr` for MFA forces re-auth when the session AAL is too low.
7. **Per-endpoint rate limiting hardening + audit-log export.**
   - We have throttler + lockout; add documented per-IP limits on the sensitive endpoints
     and a bulk audit export (CSV/JSON) + webhook sink.
   - **Accept:** export endpoint returns scoped rows; a webhook fires on audit events.

## Highest-leverage differentiators (start if P0 lands early)

8. **OAuth-for-MCP bundle** (we already have audience binding + DPoP + device flow):
   RFC 8414 AS metadata · RFC 7591/7592 Dynamic Client Registration · CIMD ·
   RFC 8707 resource indicators (wire existing audience binding) · RFC 9728 PRM helper.
   → makes us a drop-in MCP authorization server. See ROADMAP.md §P2.
9. **Token Exchange (RFC 8693)** — grant for agent on-behalf-of delegation.

## Infra / debt to clear when convenient

- **Prisma 6 → 7** (M): migrate datasource `url` → `prisma.config.ts` + client adapter;
  full test pass against a real DB. Deferred in the dep sweep.
- **TypeScript 5 → 6** (M): blocked on ts-jest/@types support; revisit.
- **ESLint 9 → 10** (S): bump once `typescript-eslint` ships ESLint 10 support.
- Resolve the ~11 remaining `no-unused-vars` warnings (intentional destructure-omits →
  prefix `_`).

## Definition of done for "SOTA-credible"

All P0 (1–7) shipped + OpenAPI + a `docker compose up` one-liner + at least Google/GitHub
social login. That's the bar where the project reads as a serious general-purpose IdP
rather than an impressive protocol demo. Differentiators (8–9, OID4VP, FAPI) are how we
then move *ahead* of the field.
