import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/redis.service';
import { IdentityService } from '../../identity/identity.service';
import { LoggerService } from '../../common/logger.service';
import { NormalizedProfile } from './contracts/normalized-profile';
import { FederationState } from './contracts/federation-state';
import { FederationResult } from './contracts/federation-result';
import { FederationEmailConflictError } from './contracts/federation-email-conflict.error';
import { FederationProviders } from './federation-providers.service';

const STATE_TTL_SECONDS = 600; // 10 min to complete the round-trip
const STATE_KEY = (state: string) => `federation:state:${state}`;

@Injectable()
export class FederationService {
  private readonly logger = new LoggerService();

  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly identityService: IdentityService,
    private readonly providers: FederationProviders,
  ) {
    this.logger.setContext('FederationService');
  }

  /** Providers with credentials configured, for the login UI. */
  getEnabledProviders(): Array<{ id: string; displayName: string }> {
    return this.providers.getEnabledProviders();
  }

  /**
   * Build the provider authorization URL and stash CSRF/PKCE state in Redis.
   * `returnTo` is where the callback sends the browser afterwards;
   * `oauthParams` carries an in-flight /authorize continuation.
   */
  async getAuthorizationUrl(
    providerId: string,
    opts: { returnTo: string; oauthParams: Record<string, string> },
  ): Promise<{ url: string }> {
    const cfg = this.providers.resolveConfig(providerId);
    const endpoints = await this.providers.getEndpoints(cfg);

    const state = crypto.randomBytes(32).toString('base64url');
    const nonce = crypto.randomBytes(16).toString('base64url');

    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: this.providers.redirectUri(cfg.id),
      response_type: 'code',
      scope: cfg.scopes.join(' '),
      state,
    });

    let codeVerifier: string | undefined;
    if (cfg.usesPkce) {
      codeVerifier = crypto.randomBytes(32).toString('base64url');
      const challenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
      params.set('code_challenge', challenge);
      params.set('code_challenge_method', 'S256');
    }
    // OIDC providers get a nonce; harmless for plain OAuth2 (GitHub ignores it).
    if (cfg.id !== 'github') params.set('nonce', nonce);

    const stateData: FederationState = {
      provider: cfg.id,
      codeVerifier,
      nonce,
      returnTo: opts.returnTo,
      oauthParams: opts.oauthParams,
    };
    await this.redis.set(
      STATE_KEY(state),
      JSON.stringify(stateData),
      STATE_TTL_SECONDS,
    );

    return { url: `${endpoints.authorizationEndpoint}?${params.toString()}` };
  }

  /**
   * Handle the provider redirect: validate state, exchange the code, fetch the
   * profile, and resolve it to a local user (link or JIT-create).
   */
  async handleCallback(
    providerId: string,
    query: { code?: string; state?: string; error?: string },
  ): Promise<FederationResult> {
    const cfg = this.providers.resolveConfig(providerId);

    if (query.error) {
      throw new UnauthorizedException(`Provider returned error: ${query.error}`);
    }
    if (!query.code || !query.state) {
      throw new BadRequestException('Missing code or state');
    }

    const raw = await this.redis.getDel(STATE_KEY(query.state));
    if (!raw) {
      // Unknown/expired/replayed state — CSRF protection.
      throw new UnauthorizedException('Invalid or expired state');
    }
    const stateData: FederationState = JSON.parse(raw);
    if (stateData.provider !== cfg.id) {
      throw new UnauthorizedException('State/provider mismatch');
    }

    const endpoints = await this.providers.getEndpoints(cfg);
    const tokens = await this.providers.exchangeCode(cfg, endpoints, {
      code: query.code,
      codeVerifier: stateData.codeVerifier,
    });
    const profile = await this.providers.fetchProfile(cfg, endpoints, tokens);

    const { user, isNewUser } = await this.resolveUser(profile);
    return {
      user,
      isNewUser,
      returnTo: stateData.returnTo,
      oauthParams: stateData.oauthParams,
    };
  }

  // ─────────────────────────── linking / JIT ───────────────────────────

  /**
   * Resolve a normalized provider profile to a local user.
   *
   * 1. Known (provider, subject) → that user (refresh the snapshot).
   * 2. Verified email matching a local user → link to it.
   * 3. Verified email, no local user → JIT-create + link.
   * 4. Unverified email matching a local user → refuse (takeover risk).
   * 5. Unverified or absent email, no match → JIT-create + link.
   */
  async resolveUser(
    profile: NormalizedProfile,
  ): Promise<{ user: FederationResult['user']; isNewUser: boolean }> {
    const existing = await this.prisma.oAuthIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: profile.provider,
          providerSubject: profile.subject,
        },
      },
      include: { user: true },
    });

    if (existing) {
      await this.prisma.oAuthIdentity.update({
        where: { id: existing.id },
        data: this.snapshot(profile),
      });
      return { user: this.shapeUser(existing.user), isNewUser: false };
    }

    const emailUser = profile.email
      ? await this.prisma.user.findUnique({ where: { email: profile.email } })
      : null;

    if (emailUser) {
      if (!profile.emailVerified) {
        throw new FederationEmailConflictError(profile.email as string);
      }
      await this.linkIdentity(emailUser.id, profile);
      this.logger.auth('Federated identity linked to existing user', {
        provider: profile.provider,
        userId: emailUser.id,
      });
      return { user: this.shapeUser(emailUser), isNewUser: false };
    }

    // JIT-create. Reuse identity issuance so the new user gets a DID.
    let user = await this.identityService.createIdentity(
      profile.email ?? undefined,
      profile.displayName ?? undefined,
    );
    if (profile.emailVerified || profile.avatarUrl) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: profile.emailVerified || undefined,
          avatarUrl: profile.avatarUrl ?? undefined,
        },
      });
    }
    await this.linkIdentity(user.id, profile);
    this.logger.auth('Federated identity JIT-created new user', {
      provider: profile.provider,
      userId: user.id,
    });
    return { user: this.shapeUser(user), isNewUser: true };
  }

  private async linkIdentity(
    userId: string,
    profile: NormalizedProfile,
  ): Promise<void> {
    await this.prisma.oAuthIdentity.create({
      data: {
        userId,
        provider: profile.provider,
        providerSubject: profile.subject,
        ...this.snapshot(profile),
      },
    });
  }

  private snapshot(profile: NormalizedProfile) {
    return {
      email: profile.email,
      emailVerified: profile.emailVerified,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      profile: profile.raw as object,
    };
  }

  private shapeUser(u: {
    id: string;
    did: string;
    email: string | null;
    name: string | null;
  }): FederationResult['user'] {
    return { id: u.id, did: u.did, email: u.email, name: u.name };
  }
}
