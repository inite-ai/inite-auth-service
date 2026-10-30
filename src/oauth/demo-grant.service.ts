import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuthClient, Organization, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../common/settings/settings.service';
import { OAuthAuditService } from '../audit/oauth-audit.service';
import { MetricsService } from '../common/metrics.service';
import { DEMO_ORG_ID, type DemoPersona } from '../organizations/demo-tenant';
import { ConsentService } from './consent.service';
import { sanitizeCustomClaims } from './custom-claims';
import { orgClaims } from './org-claims';
import { TokenRequestBody } from './dto/oauth-requests';
import { AuditCtx } from './token-support';
import {
  DemoRefused,
  DEMO_ISSUED_TOKEN_TYPE,
  DEMO_TOKEN_TTL_SECONDS,
  demoInvalidGrant,
  demoPersonaFor,
  demoScopes,
  demoUnauthorizedClient,
} from './demo-grant';

export interface DemoGrantInput {
  body: TokenRequestBody;
  client: OAuthClient;
  ctx: AuditCtx;
}

export interface DemoTokenResponse {
  access_token: string;
  issued_token_type: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
}

const isDemoMarked = (metadata: unknown): boolean =>
  (metadata as { isDemo?: unknown } | null)?.isDemo === true;

interface PersonaRow {
  passwordHash: string | null;
  metadata: unknown;
  _count: { passkeys: number; oauthIdentities: number; wallets: number };
}

/** Marked as this persona and holding no credential of any kind. */
function isCredentiallessPersona(user: PersonaRow, persona: DemoPersona): boolean {
  const meta = user.metadata as { isDemo?: unknown; persona?: unknown } | null;
  const credentials = user._count.passkeys + user._count.oauthIdentities + user._count.wallets;
  return !user.passwordHash && credentials === 0 && meta?.isDemo === true && meta.persona === persona.key;
}

/**
 * The demo grant (demo-grant.ts): `demo:<persona>` → a read-only, two-hour
 * access token of that persona in the demo org, for a first-party
 * confidential client, behind DEMO_GRANT_ENABLED. No refresh token and no
 * id_token ever: the response has no field for either, whatever the
 * request's scope says (offline_access included).
 */
@Injectable()
export class DemoGrantService {
  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly settings: SettingsService,
    private readonly audit: OAuthAuditService,
    private readonly metrics: MetricsService,
  ) {}

  async issue(input: DemoGrantInput): Promise<DemoTokenResponse> {
    const { client, ctx } = input;
    const named = demoPersonaFor(input.body.subject_token);
    try {
      const { persona, scopes } = this.assertAllowed(client, named);
      const user = await this.demoUser(persona);
      const response = this.sign({ ...user, client, scopes });
      this.metrics.tokensIssued.inc({ grant_type: 'token_exchange_demo' });
      await this.audit.record({
        event: 'token.issued.demo',
        clientId: client.clientId,
        sub: user.user.did,
        companyId: user.org.companyId,
        scopes,
        audience: client.clientId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        success: true,
        metadata: { persona: persona.key, expiresIn: DEMO_TOKEN_TTL_SECONDS },
      });
      return response;
    } catch (e: unknown) {
      if (!(e instanceof DemoRefused)) throw e;
      this.metrics.tokenFailures.inc({ grant_type: 'token_exchange_demo', reason: e.reason });
      await this.audit.record({
        event: 'token.failed.demo',
        clientId: client.clientId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        success: false,
        errorMessage: e.reason,
        metadata: { persona: named?.key ?? null },
      });
      throw e.response;
    }
  }

  /** The flag, the client and the persona's name; returns what to grant. */
  private assertAllowed(
    client: OAuthClient,
    persona: DemoPersona | null,
  ): { persona: DemoPersona; scopes: string[] } {
    if (!this.settings.flag('DEMO_GRANT_ENABLED')) {
      throw new DemoRefused('disabled', demoInvalidGrant());
    }
    // isFirstParty already refuses a dcr_* client whatever its column says.
    const confidential = !client.isPublic && client.tokenEndpointAuthMethod !== 'none';
    if (!ConsentService.isFirstParty(client) || !confidential) {
      throw new DemoRefused('client_not_first_party', demoUnauthorizedClient());
    }
    const scopes = demoScopes(client.clientId);
    if (!scopes) throw new DemoRefused('client_no_scope', demoUnauthorizedClient());
    if (!persona) throw new DemoRefused('unknown_persona', demoInvalidGrant());
    return { persona, scopes };
  }

  /**
   * The persona's user and its demo org, checked from the rows rather than
   * trusted from the name: the user is marked as that persona, holds no
   * credential, and is an active member of the one demo org, which is itself
   * marked `isDemo`. A real person who somehow got the address gets nothing.
   */
  private async demoUser(persona: DemoPersona): Promise<{ user: User; org: Organization; role: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: persona.email },
      include: {
        memberships: {
          where: { organizationId: DEMO_ORG_ID, status: 'active' },
          include: { organization: true },
        },
        _count: { select: { passkeys: true, oauthIdentities: true, wallets: true } },
      },
    });
    const membership = user?.memberships[0];
    if (
      !user ||
      !isCredentiallessPersona(user, persona) ||
      !membership ||
      membership.organization.id !== DEMO_ORG_ID ||
      !isDemoMarked(membership.organization.metadata)
    ) {
      throw new DemoRefused('persona_not_demo', demoInvalidGrant());
    }
    return { user, org: membership.organization, role: membership.role };
  }

  /**
   * The access token of a normal sign-in of this persona in the demo org
   * (OAuthTokenIssuerService.buildAccessToken), with three differences: the
   * org is always the demo org, `demo: true` is always set, and there is no
   * `platform_role` (a demo token never carries staff power).
   */
  private sign(input: {
    user: User;
    org: Organization;
    role: string;
    client: OAuthClient;
    scopes: string[];
  }): DemoTokenResponse {
    const { user, org, role, client, scopes } = input;
    const metaRoles = (user.metadata as { roles?: string[] } | null)?.roles ?? [];
    const scope = scopes.join(' ');
    const accessToken = this.jwtService.sign(
      {
        sub: user.did,
        client_id: client.clientId,
        userId: user.id,
        email: user.email,
        email_verified: user.emailVerified,
        name: user.name,
        picture: user.avatarUrl,
        roles: [...new Set([...metaRoles, role])],
        ...orgClaims({
          org: org.companyId,
          orgId: org.id,
          orgRole: role,
          orgSlug: org.slug,
          demo: true,
        }),
        ...sanitizeCustomClaims(client.customClaims),
        scope,
      },
      {
        expiresIn: DEMO_TOKEN_TTL_SECONDS,
        audience: client.clientId,
        issuer: this.configService.get<string>('JWT_ISSUER', 'http://localhost:3002'),
      },
    );
    return {
      access_token: accessToken,
      issued_token_type: DEMO_ISSUED_TOKEN_TYPE,
      token_type: 'Bearer',
      expires_in: DEMO_TOKEN_TTL_SECONDS,
      scope,
    };
  }
}
