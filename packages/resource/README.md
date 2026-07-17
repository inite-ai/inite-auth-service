# @inite/auth-resource

Server-side access-token verification for INITE resource services
(verticals: brain, inbox, …). The browser SDK is `@inite/auth-sdk`; this
package is its backend counterpart.

- JWT verification against the IdP's remote JWKS (RS256, kid-rotation aware).
- `iss` / `aud` / `exp` enforcement — a token minted for another vertical never passes.
- Shared tenant/user mapping: `org` claim → tenant, `sub` → user; M2M tokens
  (no `org`) map `sub` → tenant.
- RFC 7662 introspection fallback for opaque credentials (API keys).
- NestJS guard + `@RequireScopes()` decorator via the `./nest` subpath.

## Usage (framework-free)

```ts
import { createTokenVerifier } from '@inite/auth-resource';

const verifier = createTokenVerifier({
  issuer: 'https://auth.inite.ai',
  audience: 'brain',
  // Optional: verify opaque API keys through the IdP
  introspection: {
    clientId: process.env.OAUTH_CLIENT_ID!,
    clientSecret: process.env.OAUTH_CLIENT_SECRET!,
  },
});

const principal = await verifier.verify(bearerToken);
// principal.tenantId  — org (companyId) for user tokens, sub for M2M
// principal.userId    — set only for user-bound tokens
// principal.scopes / roles / entitlements / actor
```

## Usage (NestJS)

```ts
import { IniteAuthResourceModule, IniteResourceGuard, RequireScopes } from '@inite/auth-resource/nest';

@Module({
  imports: [
    IniteAuthResourceModule.forRoot({
      issuer: process.env.AUTH_SERVICE_ISSUER!,
      audience: 'brain',
    }),
  ],
})
export class AppModule {}

@UseGuards(IniteResourceGuard)
@RequireScopes('brain:read')
@Get('search')
search(@Req() req: AuthenticatedRequest) {
  return this.service.search(req.initeAuth!.tenantId, req.initeAuth!.userId);
}
```

## Errors

Every failure throws `TokenVerificationError` with a stable `code`:
`invalid_token`, `unsupported_credential` (opaque credential without
introspection configured), `introspection_unavailable`.
