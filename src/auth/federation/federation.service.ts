import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/redis.service';
import { IdentityService } from '../../identity/identity.service';
import { LoggerService } from '../../common/logger.service';
import {
  ProviderConfig,
  ProviderEndpoints,
  TokenResponse,
  NormalizedProfile,
  FederationState,
  FederationResult,
  FederationEmailConflictError,
} from './federation.types';
import {
  STATIC_PROVIDERS,
  normalizeGoogleProfile,
  normalizeGithubProfile,
  normalizeOidcProfile,
  tokenResponseOk,
} from './providers';

const STATE_TTL_SECONDS = 600; // 10 min to complete the round-trip
const STATE_KEY = (state: string) => `federation:state:${state}`;
const DISCOVERY_TTL_MS = 60 * 60 * 1000; // cache OIDC discovery for 1h

@Injectable()
export class FederationService {
  private readonly logger = new LoggerService();
  private discoveryCache = new Map<
    string,
    { endpoints: ProviderEndpoints; expiresAt: number }
  >();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly identityService: IdentityService,
  ) {
    this.logger.setContext('FederationService');
  }

  /** Providers with credentials configured, for the login UI. */
  getEnabledProviders(): Array<{ id: string; displayName: string }> {
    return ['google', 'github', 'oidc']
      .map((id) => this.tryResolveConfig(id))
      .filter((c): c is ProviderConfig => c !== null)
      .map((c) => ({ id: c.id, displayName: c.displayName }));
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
    const cfg = this.resolveConfig(providerId);
    const endpoints = await this.getEndpoints(cfg);

    const state = crypto.randomBytes(32).toString('base64url');
    const nonce = crypto.randomBytes(16).toString('base64url');

    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: this.redirectUri(cfg.id),
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
    const cfg = this.resolveConfig(providerId);

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

    const endpoints = await this.getEndpoints(cfg);
    const tokens = await this.exchangeCode(
      cfg,
      endpoints,
      query.code,
      stateData.codeVerifier,
    );
    const profile = await this.fetchProfile(cfg, endpoints, tokens);

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

  // ─────────────────────────── provider plumbing ───────────────────────────

  private async exchangeCode(
    cfg: ProviderConfig,
    endpoints: ProviderEndpoints,
    code: string,
    codeVerifier?: string,
  ): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri(cfg.id),
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    });
    if (codeVerifier) body.set('code_verifier', codeVerifier);

    const res = await fetch(endpoints.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // GitHub returns urlencoded by default; ask for JSON.
        Accept: 'application/json',
      },
      body: body.toString(),
    });
    const tokens = (await res.json()) as TokenResponse;
    if (!res.ok || !tokenResponseOk(tokens)) {
      this.logger.error('Token exchange failed', tokens?.error ?? `HTTP ${res.status}`, {
        provider: cfg.id,
      });
      throw new UnauthorizedException('Token exchange with provider failed');
    }
    return tokens;
  }

  private async fetchProfile(
    cfg: ProviderConfig,
    endpoints: ProviderEndpoints,
    tokens: TokenResponse,
  ): Promise<NormalizedProfile> {
    const authHeader = { Authorization: `Bearer ${tokens.access_token}` };

    if (cfg.id === 'github') {
      const [user, emails] = await Promise.all([
        this.getJson(endpoints.userinfoEndpoint as string, {
          ...authHeader,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'inite-auth-service',
        }),
        this.getJson('https://api.github.com/user/emails', {
          ...authHeader,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'inite-auth-service',
        }).catch(() => [] as any),
      ]);
      return normalizeGithubProfile(user, Array.isArray(emails) ? emails : []);
    }

    const data = await this.getJson(
      endpoints.userinfoEndpoint as string,
      authHeader,
    );
    return cfg.id === 'google'
      ? normalizeGoogleProfile(data)
      : normalizeOidcProfile(data);
  }

  private async getJson(
    url: string,
    headers: Record<string, string>,
  ): Promise<any> {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new UnauthorizedException(
        `Provider profile request failed (HTTP ${res.status})`,
      );
    }
    return res.json();
  }

  /** Resolve a provider's endpoints (static or via cached OIDC discovery). */
  private async getEndpoints(cfg: ProviderConfig): Promise<ProviderEndpoints> {
    if (cfg.endpoints) return cfg.endpoints;
    if (!cfg.issuer) {
      throw new BadRequestException(`Provider ${cfg.id} has no issuer configured`);
    }
    const cached = this.discoveryCache.get(cfg.issuer);
    if (cached && cached.expiresAt > Date.now()) return cached.endpoints;

    const url = `${cfg.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const doc = await this.getJson(url, { Accept: 'application/json' });
    const endpoints: ProviderEndpoints = {
      authorizationEndpoint: doc.authorization_endpoint,
      tokenEndpoint: doc.token_endpoint,
      userinfoEndpoint: doc.userinfo_endpoint,
    };
    if (!endpoints.authorizationEndpoint || !endpoints.tokenEndpoint) {
      throw new BadRequestException('OIDC discovery document is incomplete');
    }
    // Date.now() is fine here (runtime cache, not part of any replayable state).
    this.discoveryCache.set(cfg.issuer, {
      endpoints,
      expiresAt: Date.now() + DISCOVERY_TTL_MS,
    });
    return endpoints;
  }

  private redirectUri(providerId: string): string {
    const base = (
      this.config.get<string>('FEDERATION_REDIRECT_BASE') ??
      this.config.get<string>('OIDC_ISSUER') ??
      'http://localhost:3002'
    ).replace(/\/$/, '');
    return `${base}/v1/auth/oauth/${providerId}/callback`;
  }

  /** Resolve config for an enabled provider; 404 if unknown/disabled. */
  private resolveConfig(providerId: string): ProviderConfig {
    const cfg = this.tryResolveConfig(providerId);
    if (!cfg) {
      throw new NotFoundException(
        `Unknown or not-configured federation provider: ${providerId}`,
      );
    }
    return cfg;
  }

  /** Build provider config from env, or null when credentials are absent. */
  private tryResolveConfig(providerId: string): ProviderConfig | null {
    if (providerId === 'google' || providerId === 'github') {
      const prefix = providerId.toUpperCase();
      const clientId = this.config.get<string>(`${prefix}_CLIENT_ID`);
      const clientSecret = this.config.get<string>(`${prefix}_CLIENT_SECRET`);
      if (!clientId || !clientSecret) return null;
      const meta = STATIC_PROVIDERS[providerId];
      return {
        id: providerId,
        displayName: meta.displayName,
        clientId,
        clientSecret,
        scopes: this.scopesFromEnv(`${prefix}_SCOPES`, meta.scopes),
        usesPkce: meta.usesPkce,
        endpoints: meta.endpoints,
      };
    }

    if (providerId === 'oidc') {
      const clientId = this.config.get<string>('OIDC_FEDERATION_CLIENT_ID');
      const clientSecret = this.config.get<string>('OIDC_FEDERATION_CLIENT_SECRET');
      const issuer = this.config.get<string>('OIDC_FEDERATION_ISSUER');
      if (!clientId || !clientSecret || !issuer) return null;
      return {
        id: 'oidc',
        displayName:
          this.config.get<string>('OIDC_FEDERATION_NAME') ?? 'Single Sign-On',
        clientId,
        clientSecret,
        scopes: this.scopesFromEnv('OIDC_FEDERATION_SCOPES', [
          'openid',
          'email',
          'profile',
        ]),
        usesPkce: true,
        endpoints: null,
        issuer,
      };
    }

    return null;
  }

  private scopesFromEnv(key: string, fallback: string[]): string[] {
    const raw = this.config.get<string>(key);
    if (!raw) return fallback;
    return raw.split(/[\s,]+/).filter(Boolean);
  }
}
