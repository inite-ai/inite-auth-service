# Resume — next session

## State
- main = v1.3.0 (released). Gates: **max-lines 300**, max-params 3, complexity 12.
- **PR #49** open (`feat/finish-followups`): Token Exchange RFC 8693 + max-lines→300
  + 4 splits (federation/token/admin/email) + 4 legacy god-files under tracked
  `/* eslint-disable max-lines -- TODO(god-file) */`. **Merge #49 first.**
- Every push to main = prod deploy → use feature branch + PR.

## Do, in order
1. **Split the 4 god-files <300** (remove the eslint-disable banner once done; build+test
   after EACH; update specs — they construct services positionally, args shift):
   - `oauth.service` 742 → + `oauth-token-issuer.service` (generateTokens / refresh /
     client-credentials / token-exchange) + `oauth-client-registry.service` (validate /
     register / rotate). Worst offender — do first.
   - `identity.service` 561 → + `vc-issuer.service` (Verifiable Credential issuance).
   - `oauth.controller` 507 → + `discovery`/`consent` controller (create-code, session,
     logout, userinfo) sharing the /v1/oauth prefix.
   - `auth.controller` 429 → + `passkey.controller` (passkey/* endpoints).
2. **Step-up MFA "enter code" widget** (frontend) → `/v1/auth/otp/mfa/{request,verify}`.
3. **OAuth-for-MCP bundle**: RFC 8414 `.well-known/oauth-authorization-server` alias,
   RFC 7591 Dynamic Client Registration, RFC 8707 resource-indicator wiring, RFC 9728 PRM.
4. **Pay down legacy `TODO(par-max)`/`TODO(complexity)` disables** (options objects / decompose).
5. **Tooling**: ESLint 9→10, js-yaml (jest 3.x — blocked, document), Prisma 6→7 (needs live DB),
   TS 5→6 (blocked on ts-jest).

## Gotchas
- After a constructor change, update the spec's positional `new X(...)` args (hit this on
  admin/oauth/token specs).
- `node -e '...'` under single-quoted shell strips inner single quotes — use double quotes inside.
- Split pattern that worked: extract an `@Injectable` sub-service, inject it, delegate, register
  in the module, fix the spec, build+test, then drop the banner.
