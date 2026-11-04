import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Optional } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SsfEmitterService } from '../ssf/ssf-emitter.service';
import { AuthorizationDetail } from './contracts/authorization-detail';
import { PersonalWorkspaceService } from './personal-workspace.service';
import { CAEP_EVENTS } from '../ssf/caep-event-types';
import { SettingsService } from '../common/settings/settings.service';
import { sanitizeCustomClaims } from './custom-claims';
import { currentDeviceMetadata } from '../common/device-metadata';
import { AgentsService } from './agents.service';
import { hashRefreshToken, refreshTokenSecret } from './refresh-token-secret';
import { platformRoleClaim } from './platform-role-claim';
import { type RefreshBoundClient } from './refresh-bounds';
import { isDemoOrganization } from '../organizations/demo-tenant';
import { orgClaims, type OrgContext } from './org-claims';
import { staffRoles, tokenTenant } from './customer-lane';
import { OAuthAuditService } from '../audit/oauth-audit.service';
import type { IssuedTokens } from './token-support';
import { expirySeconds } from './token-expiry';
import { type RefreshTokenGate } from './refresh-grace';
import { FieldCrypto } from '../common/field-crypto';
import { RefreshGrant } from './refresh-grant';

export interface GenerateTokensInput {
  user: User;
  clientId: string;
  scope: string;
  rotatedFrom?: string;
  nonce?: string;
  authnContext?: { amr?: string[]; acr?: string };
  /**
   * RFC 8707 resource-bound audience for the ACCESS token. When set, the
   * access token's `aud` becomes this value instead of the clientId. The
   * id_token `aud` is NOT affected — it stays the clientId per OIDC core.
   */
  audience?: string;
  /**
   * RFC 9396 authorization_details granted for this token. Emitted as an
   * access-token claim and persisted on the refresh token so rotation keeps
   * the same grant.
   */
  authorizationDetails?: AuthorizationDetail[];
  /**
   * The org (Organization.companyId) the grant was made for: the code's or the
   * refresh token's companyId. Honoured only for a customer-lane client, whose
   * code names the hinted org (customer-lane.ts); every other client keeps
   * choosing by its own companyId, as before.
   */
  tenant?: string | null;
}

/** Issuer + access-token expiry resolved once per token issuance. */
interface SigningContext {
  issuer: string;
  /** Access/id-token lifetime in seconds: signed as `exp` and reported as `expires_in`. */
  accessTokenTtl: number;
}

@Injectable()
export class OAuthTokenIssuerService {
  private readonly refreshGrant: RefreshGrant;

  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly settings: SettingsService,
    @Optional() private readonly ssf?: SsfEmitterService,
    // Optional: unit fixtures build this service with four arguments, and
    // without it resolveOrgContext simply never provisions — the
    // behaviour every deployment had before the flag existed.
    @Optional() private readonly personalWorkspace?: PersonalWorkspaceService,
    // Optional for the same reason: without it no token carries an agent.
    @Optional() private readonly agents?: AgentsService,
    // Optional: without it the refresh-reuse paths are logged, not audited.
    @Optional() audit?: OAuthAuditService,
    // Optional: without it (or without FIELD_ENCRYPTION_KEY) no rotation's
    // pair is kept, so the refresh reuse grace is off.
    @Optional() fieldCrypto?: FieldCrypto,
  ) {
    this.refreshGrant = new RefreshGrant({
      prisma,
      settings,
      secret: () => this.getRefreshTokenSecret(),
      issue: (input, gate) => this.generateTokens(input, gate),
      signalRevoked: (did, companyId) => this.signalTokenRevoked(did, companyId),
      audit,
      fieldCrypto,
    });
  }

  private getRefreshTokenSecret(): string {
    return refreshTokenSecret(this.configService);
  }

  /**
   * Generate access token, refresh token, and ID token.
   *
   * `rotatedFrom`, when present, is the id of the previous refresh token
   * in the rotation chain. Setting it on creation (rather than via a
   * second updateMany after) is what fixes the previous silent-corruption
   * bug — bcrypt's salted hash made the post-create lookup never match.
   *
   * `gate`, when present, runs in the same transaction as the refresh-token
   * insert, with the pair about to be returned, and may abort it
   * (RefreshGateRefused): the rotation claim, which also keeps the pair for
   * the reuse grace (refresh-grace.ts).
   */
  async generateTokens(input: GenerateTokensInput, gate?: RefreshTokenGate): Promise<IssuedTokens> {
    const sctx = this.signingContext();
    // A third-party application acts as an agent of the person (RFC 8693 `act`).
    const act = await this.agents?.actFor(input.user.id, input.clientId, input.authorizationDetails);
    const orgCtx = { ...(await this.resolveOrgContext(input)), act };

    const accessToken = this.buildAccessToken(input, sctx, orgCtx);
    const idToken = this.buildIdToken(input, sctx, orgCtx);

    const issued: IssuedTokens = {
      accessToken,
      refreshToken: crypto.randomBytes(32).toString('base64url'),
      idToken,
      // The access token's real lifetime, so a client refreshes when it must.
      expiresIn: sctx.accessTokenTtl,
      scope: input.scope,
    };
    await this.persistRefreshToken(input, issued, gate);
    return issued;
  }

  private signingContext(): SigningContext {
    return {
      issuer: this.configService.get<string>('JWT_ISSUER', 'http://localhost:3002'),
      accessTokenTtl: expirySeconds(this.settings.value('JWT_ACCESS_TOKEN_EXPIRY', '10m'), 600),
    };
  }

  private buildAccessToken(
    input: GenerateTokensInput,
    sctx: SigningContext,
    orgCtx: OrgContext,
  ): string {
    const { user, clientId, scope } = input;
    return this.jwtService.sign(
      {
        sub: user.did,
        // RFC 9068 §2.2 — the client the token was issued to. Resource
        // servers use it for agent attribution when no act claim exists
        // (device-flow MCP clients call them directly, no exchange).
        client_id: clientId,
        userId: user.id,
        email: user.email,
        email_verified: user.emailVerified,
        name: user.name,
        picture: user.avatarUrl,
        roles: orgCtx.roles,
        ...platformRoleClaim(user),
        ...orgClaims(orgCtx),
        // Per-client vertical claims (policy/packs) — allow-listed keys
        // only, so they can never shadow the registered claims above.
        ...(orgCtx.customClaims ?? {}),
        // RFC 8693 §4.1: the agent acting for the person, when it is one.
        ...(orgCtx.act ? { act: orgCtx.act } : {}),
        // RFC 9396: echo the granted authorization_details into the access token.
        ...(input.authorizationDetails?.length
          ? { authorization_details: input.authorizationDetails }
          : {}),
        scope,
      },
      {
        expiresIn: sctx.accessTokenTtl,
        // RFC 8707: bind the access-token audience to the requested
        // resource when present; otherwise default to the clientId.
        audience: input.audience ?? clientId,
        issuer: sctx.issuer,
      },
    );
  }

  private buildIdToken(
    input: GenerateTokensInput,
    sctx: SigningContext,
    orgCtx: OrgContext,
  ): string {
    const { user, clientId, nonce } = input;
    const authnContext = input.authnContext ?? {};
    // nonce goes ONLY into the id_token per OIDC core §2 — access_token
    // does not carry it because RPs validate nonces on the id_token side.
    const idTokenClaims: Record<string, unknown> = {
      sub: user.did,
      email: user.email,
      email_verified: user.emailVerified,
      name: user.name,
      picture: user.avatarUrl,
      roles: orgCtx.roles,
      ...platformRoleClaim(user),
      ...orgClaims(orgCtx),
    };
    if (nonce) idTokenClaims.nonce = nonce;
    // amr is RFC 8176 — list of methods that authenticated the user
    // for this session. acr is a coarser bucket the RP can compare
    // against acr_values_supported. Both ride the id_token only.
    if (authnContext.amr && authnContext.amr.length > 0) {
      idTokenClaims.amr = authnContext.amr;
    }
    if (authnContext.acr) idTokenClaims.acr = authnContext.acr;

    return this.jwtService.sign(idTokenClaims, {
      expiresIn: sctx.accessTokenTtl,
      audience: clientId,
      issuer: sctx.issuer,
    });
  }

  /**
   * Resolve the roles + org context to stamp on issued tokens. Backward
   * compatible: by default (RBAC_TOKEN_CLAIMS_ENABLED unset) it returns just
   * the legacy metadata.roles so existing consumers are unchanged. When
   * enabled, roles become the UNION of metadata.roles and the user's active
   * membership roles, and org/org_id claims are added for the org matching the
   * client's tenant (companyId) — falling back to the user's first membership.
   */
  private async resolveOrgContext(input: GenerateTokensInput): Promise<OrgContext> {
    const metadata = input.user.metadata as { roles?: string[] } | null;
    const metaRoles: string[] = metadata?.roles ?? [];
    // The client row is fetched regardless of the RBAC flag: per-client
    // custom claims (policy/packs) are a vertical-facing channel, not an
    // RBAC feature, and must survive the flag being off.
    const clientRow = await this.prisma.oAuthClient.findUnique({
      where: { clientId: input.clientId },
      select: { companyId: true, customClaims: true, customerLane: true },
    });
    const customClaims = sanitizeCustomClaims(clientRow?.customClaims);
    const base: OrgContext = {
      roles: metaRoles.length ? metaRoles : ['user'],
      ...(Object.keys(customClaims).length > 0 ? { customClaims } : {}),
    };
    if (!this.settings.flag('RBAC_TOKEN_CLAIMS_ENABLED')) {
      return base;
    }

    const memberships = await this.prisma.membership.findMany({
      where: { userId: input.user.id, status: 'active' },
      include: { organization: true },
    });
    if (memberships.length === 0) {
      const provisioned = await this.personalWorkspace?.provisionFor(input);
      if (!provisioned) return base;
      return {
        ...base,
        roles: [...new Set([...metaRoles, 'owner'])],
        org: provisioned.companyId,
        orgId: provisioned.id,
        orgRole: 'owner',
        orgSlug: provisioned.slug,
      };
    }

    const tenant = tokenTenant(clientRow, input.tenant);
    const chosen =
      memberships.find((m) => m.organization.companyId === tenant) ?? memberships[0]!; // memberships is non-empty (checked above)
    const roles = [...new Set([...metaRoles, ...staffRoles(memberships)])];
    return {
      ...base,
      roles: roles.length ? roles : ['user'],
      org: chosen.organization.companyId,
      orgId: chosen.organizationId,
      orgRole: chosen.role,
      orgSlug: chosen.organization.slug,
      demo: isDemoOrganization(chosen.organization),
    };
  }

  private async persistRefreshToken(
    input: GenerateTokensInput,
    issued: IssuedTokens,
    gate?: RefreshTokenGate,
  ): Promise<void> {
    const { user, clientId, scope, nonce, rotatedFrom } = input;
    const authnContext = input.authnContext ?? {};
    const tokenLookup = hashRefreshToken(issued.refreshToken, this.getRefreshTokenSecret());

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Tenant scope is stamped on the refresh token at issue-time so
    // admin reads can filter by companyId without joining oauth_clients
    // (and survive a client delete).
    const clientRow = await this.prisma.oAuthClient.findUnique({
      where: { clientId },
      select: { companyId: true, customerLane: true },
    });

    const data: Prisma.RefreshTokenUncheckedCreateInput = {
      tokenLookup,
      userId: user.id,
      clientId,
      // A customer-lane token keeps its org across rotation.
      companyId: tokenTenant(clientRow, input.tenant),
      scope,
      nonce: nonce ?? null,
      amr: authnContext.amr ?? [],
      ...currentDeviceMetadata(), // ip, userAgent
      lastUsedAt: new Date(),
      // RFC 8707: persist the bound resource so rotation keeps the audience.
      resource: input.audience ?? null,
      // RFC 9396: persist the grant so rotation re-emits the same details.
      authorizationDetails: input.authorizationDetails?.length
        ? (input.authorizationDetails as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      expiresAt,
      revoked: false,
      rotatedFrom: rotatedFrom ?? null,
    };
    if (!gate) {
      await this.prisma.refreshToken.create({ data });
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await gate(tx, issued);
      await tx.refreshToken.create({ data });
    });
  }

  /**
   * Refresh access token using refresh token: rotation, theft detection and
   * the reuse grace (refresh-grant.ts).
   */
  async refreshAccessToken(
    refreshTokenValue: string,
    clientId: string,
    client?: RefreshBoundClient,
  ): Promise<IssuedTokens> {
    return this.refreshGrant.refresh(refreshTokenValue, clientId, client);
  }

  /**
   * Revoke refresh token (RFC 7009).
   * O(1) lookup via tokenLookup. Silently no-ops if the token is unknown,
   * already revoked, or for a different client — per spec.
   */
  async revokeToken(token: string, clientId: string): Promise<void> {
    const tokenLookup = hashRefreshToken(token, this.getRefreshTokenSecret());
    const row = await this.prisma.refreshToken.findFirst({
      where: { tokenLookup, clientId },
      select: { companyId: true, user: { select: { did: true } } },
    });
    await this.prisma.refreshToken.updateMany({
      where: { tokenLookup, clientId, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
    if (row) await this.signalTokenRevoked(row.user?.did, row.companyId);
  }

  /**
   * CAEP token-claims-change (token-revoked) signal (fire-and-forget) so
   * subscribed receivers can drop the revoked token. No-op without SSF.
   */
  private async signalTokenRevoked(
    did: string | undefined,
    companyId: string | null,
  ): Promise<void> {
    if (!this.ssf || !did) return;
    await this.ssf.emit({
      eventType: CAEP_EVENTS.tokenClaimsChange,
      subject: did,
      companyId,
    });
  }
}
