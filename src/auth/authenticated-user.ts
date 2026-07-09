/**
 * The principal attached to `req.user` by JwtStrategy.validate().
 *
 * A discriminated union on `kind`:
 *  - `user`    — a person (access token with a userId). Carries identity +
 *                profile metadata.
 *  - `machine` — a service (client_credentials M2M token, no userId). Carries
 *                the calling client + tenant, authorized off `scope`.
 *
 * Keep this in sync with JwtStrategy.validate() — it is the single source of
 * truth for what routes can rely on after JwtAuthGuard.
 */
export interface UserPrincipal {
  kind: 'user';
  userId: string;
  did: string;
  email: string | null;
  metadata: Record<string, unknown> | null;
  scope: Set<string>;
}

export interface MachinePrincipal {
  kind: 'machine';
  sub: string;
  clientId: string | null;
  audience: string | string[] | null;
  companyId: string | null;
  scope: Set<string>;
}

export type AuthenticatedUser = UserPrincipal | MachinePrincipal;
