import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as crypto from 'crypto';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PkceService } from './pkce.service';
import { IdentityService } from '../identity/identity.service';
import { EmailService } from '../email/email.service';
import { CreateAuthorizationCodeInput } from './dto/create-authorization-code.input';
import { OAuthTokenIssuerService } from './oauth-token-issuer.service';

export interface ExchangeAuthorizationCodeInput {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier?: string;
}

@Injectable()
export class OAuthService {
  private readonly oauthLogger = new Logger(OAuthService.name);

  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly pkceService: PkceService,
    private readonly identityService: IdentityService,
    private readonly emailService: EmailService,
    private readonly tokenIssuer: OAuthTokenIssuerService,
  ) {}

  /**
   * Look up a user by id. Lets controllers stay out of the persistence
   * layer (see eslint import/no-restricted-paths).
   */
  async findUserById(userId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  /** Resolve a user's DID from their id, or null if absent. */
  async getUserDid(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { did: true },
    });
    return user?.did ?? null;
  }

  /**
   * Normalize scope
   */
  normalizeScope(requestedScope: string): string {
    const scopes = this.parseScope(requestedScope);
    return scopes.length > 0 ? scopes.join(' ') : 'openid profile email';
  }

  /**
   * Create authorization code.
   *
   * `nonce` is the OIDC nonce parameter (core §3.1.2.1) and gets
   * round-tripped into the id_token claims at /token. We store it
   * verbatim — the spec leaves length+format to the RP — and only
   * embed it when present, so legacy OAuth2-only clients don't get
   * an unexpected claim.
   */
  async createAuthorizationCode(
    input: CreateAuthorizationCodeInput,
  ): Promise<string> {
    const code = crypto.randomBytes(32).toString('base64url');

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    // Resolve companyId from the client row so the auth-code row
    // carries the tenant scope. A separate query keeps this cheap
    // even when the caller already validated the client elsewhere.
    const clientRow = await this.prisma.oAuthClient.findUnique({
      where: { clientId: input.clientId },
      select: { companyId: true },
    });

    await this.prisma.authorizationCode.create({
      data: {
        code,
        userId: input.userId,
        clientId: input.clientId,
        companyId: clientRow?.companyId ?? null,
        redirectUri: input.redirectUri,
        scope: input.scope,
        codeChallenge: input.codeChallenge,
        codeChallengeMethod: input.codeChallengeMethod,
        nonce: input.nonce ?? null,
        acrValues: input.acrValues ?? null,
        resource: input.resource ?? null,
        amr: input.amr ?? [],
        expiresAt,
        used: false,
      },
    });

    return code;
  }

  /**
   * Exchange authorization code for tokens.
   *
   * Atomicity: the code is claimed via a single UPDATE WHERE used=false
   * (Postgres' atomic single-row update guarantees only one concurrent
   * request wins). Two parallel /token requests with the same code can no
   * longer both pass the used-check — exactly one succeeds.
   *
   * Code-replay defense: if the claim fails because the code was already
   * used, treat it as theft and revoke the entire refresh-token family
   * issued from that code's user+client (RFC 6819 §4.4.1.1).
   */
  async exchangeAuthorizationCode(
    input: ExchangeAuthorizationCodeInput,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    idToken: string;
    expiresIn: number;
    scope: string;
  }> {
    const { code, clientId, redirectUri, codeVerifier } = input;
    const claim = await this.prisma.authorizationCode.updateMany({
      where: {
        code,
        clientId,
        redirectUri,
        used: false,
        expiresAt: { gt: new Date() },
      },
      data: { used: true },
    });

    if (claim.count !== 1) {
      await this.handleCodeClaimFailure(code);
    }

    const authCode = await this.prisma.authorizationCode.findUnique({
      where: { code },
      include: { user: true },
    });
    if (!authCode) {
      // Should never happen — we just claimed this row.
      throw new BadRequestException('Authorization code not found after claim');
    }

    if (authCode.codeChallenge) {
      if (!codeVerifier) {
        throw new BadRequestException('Code verifier required');
      }

      const isValid = this.pkceService.verifyCodeChallenge(
        codeVerifier,
        authCode.codeChallenge,
        authCode.codeChallengeMethod || 'S256',
      );

      if (!isValid) {
        throw new BadRequestException('Invalid code verifier');
      }
    }

    // RFC 8707: if the code carries a requested resource, bind the issued
    // access token's audience to it (validated against the client's
    // allowedAudiences). Undefined result → audience stays the clientId.
    const audience = await this.resolveCodeAudience(clientId, authCode.resource);

    const scope = authCode.scope ?? '';
    const tokens = await this.tokenIssuer.generateTokens({
      user: authCode.user,
      clientId,
      scope,
      nonce: authCode.nonce ?? undefined,
      audience,
      authnContext: {
        amr: authCode.amr ?? [],
        acr: authCode.acrValues ?? undefined,
      },
    });

    // Best-effort: if this is the first successful token exchange
    // between this user and this client, notify the user so they
    // have an audit trail of "what apps did I authorize?" outside
    // the admin panel. We check for any pre-existing (non-revoked)
    // refresh token from before this generateTokens() call — the
    // new one we just minted will be present too, so we exclude it
    // by created_at ordering rather than count.
    this.notifyFirstTimeConsent(authCode.user, clientId, scope).catch(
      (err) =>
        this.oauthLogger.warn(
          `first-time-consent notification failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
    );

    return tokens;
  }

  /**
   * Code-claim failed (already used / expired / unknown). If the code exists
   * and was already used, treat it as replay and revoke the refresh-token
   * family issued from that code's user+client (RFC 6819 §4.4.1.1). Always
   * throws — the caller's claim did not win the atomic UPDATE.
   */
  private async handleCodeClaimFailure(code: string): Promise<never> {
    const replay = await this.prisma.authorizationCode.findUnique({
      where: { code },
    });
    if (replay && replay.used) {
      this.oauthLogger.warn(
        `Authorization code replay detected — revoking refresh-token family for user=${replay.userId} client=${replay.clientId}`,
      );
      await this.prisma.refreshToken.updateMany({
        where: { userId: replay.userId, clientId: replay.clientId, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      });
    }
    throw new BadRequestException('Invalid or expired authorization code');
  }

  /**
   * RFC 8707 audience resolution for the authorization_code flow. Mirrors
   * the M2M `resolveExchangeAudience` rule: when the client restricts
   * `allowedAudiences`, the requested resource MUST be in that list or the
   * request is rejected — a restricted client can never mint a token for an
   * arbitrary audience. Returns `undefined` when the code carried no
   * resource, so the token issuer keeps its default (clientId) audience.
   */
  private async resolveCodeAudience(
    clientId: string,
    resource: string | null,
  ): Promise<string | undefined> {
    if (!resource) return undefined;

    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId },
      select: { allowedAudiences: true },
    });
    const allowedAud = client?.allowedAudiences ?? [];
    if (allowedAud.length > 0 && !allowedAud.includes(resource)) {
      throw new BadRequestException(
        `Resource "${resource}" is not allowed for this client`,
      );
    }
    return resource;
  }

  /**
   * Send the "you authorized this app" email exactly once per
   * (user, client). Skipped when a non-revoked refresh token already
   * existed before this exchange — that means the grant isn't new.
   */
  private async notifyFirstTimeConsent(
    user: User,
    clientId: string,
    scope: string,
  ): Promise<void> {
    try {
      // Count refresh tokens for this user+client created MORE than
      // 5 seconds ago. The one we just minted is younger than that,
      // so a count of 0 means "this was the first issuance".
      const cutoff = new Date(Date.now() - 5000);
      const priorCount = await this.prisma.refreshToken.count({
        where: {
          userId: user.id,
          clientId,
          createdAt: { lt: cutoff },
        },
      });
      if (priorCount > 0) return;

      const client = await this.prisma.oAuthClient.findUnique({
        where: { clientId },
        select: { name: true },
      });
      const scopes = scope ? scope.split(/\s+/).filter(Boolean) : [];
      await this.emailService.sendOAuthConsentGranted(
        { email: user.email ?? '', name: user.name ?? undefined },
        client?.name ?? clientId,
        scopes,
      );
    } catch (e: unknown) {
      this.oauthLogger.warn(
        `first-time-consent notification failed: ${e instanceof Error ? e.message : 'unknown'}`,
      );
    }
  }

  /**
   * Get user info (OIDC endpoint)
   */
  async getUserInfo(userId: string): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const wallets = await this.identityService.getWallets(userId);

    return {
      sub: user.did,
      email: user.email,
      email_verified: user.emailVerified,
      name: user.name,
      picture: user.avatarUrl,
      did: user.did,
      wallets: wallets.map((w) => ({
        address: w.address,
        chain: w.chain,
      })),
    };
  }

  getFrontendUrl(): string {
    return this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
  }

  /**
   * Parse scope string into entitlements array
   */
  private parseScope(scope: string): string[] {
    if (!scope) return [];
    return scope.split(' ').filter(Boolean);
  }

  /**
   * Cleanup expired codes and tokens — runs every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpired(): Promise<void> {
    this.oauthLogger.log('Cleaning up expired tokens and codes...');
    const now = new Date();

    await this.prisma.authorizationCode.deleteMany({
      where: { expiresAt: { lt: now } },
    });

    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    if (count) {
      this.oauthLogger.log(`Deleted ${count} expired refresh tokens`);
    }
  }
}
