import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../common/logger.service';
import { ProviderConfig } from './contracts/provider-config';
import { ProviderEndpoints } from './contracts/provider-endpoints';
import { TokenResponse } from './contracts/token-response';
import { NormalizedProfile } from './contracts/normalized-profile';
import {
  STATIC_PROVIDERS,
  normalizeGoogleProfile,
  normalizeGithubProfile,
  normalizeOidcProfile,
  tokenResponseOk,
} from './providers';
import { FederationConfigStore, FederationDbEntry } from './federation-config.store';

const DISCOVERY_TTL_MS = 60 * 60 * 1000; // cache OIDC discovery for 1h

/**
 * Provider-facing plumbing for federation: env-driven config resolution, OIDC
 * discovery (cached), the code→token exchange, and profile fetch/normalize.
 * Split out of FederationService so each stays within the size gate —
 * FederationService owns the flow + user-linking, this owns the IdP I/O.
 */
@Injectable()
export class FederationProviders {
  private readonly logger = new LoggerService();
  private discoveryCache = new Map<
    string,
    { endpoints: ProviderEndpoints; expiresAt: number }
  >();

  constructor(
    private readonly config: ConfigService,
    private readonly store: FederationConfigStore,
  ) {
    this.logger.setContext('FederationProviders');
  }

  /** Public read of the pure-env config for a provider (admin source detection). */
  envConfig(providerId: string): ProviderConfig | null {
    return this.fromEnv(providerId);
  }

  /**
   * Resolve a provider's config for an admin connectivity test, ignoring the
   * enabled flag (operators test before enabling). DB row wins over env.
   */
  resolveForTest(providerId: string): ProviderConfig | null {
    const db = this.store.getEntry(providerId);
    if (db) return this.fromDbEntry(providerId, { ...db, enabled: true });
    return this.fromEnv(providerId);
  }

  /** Providers with credentials configured, for the login UI. */
  getEnabledProviders(): Array<{ id: string; displayName: string }> {
    return ['google', 'github', 'oidc']
      .map((id) => this.tryResolveConfig(id))
      .filter((c): c is ProviderConfig => c !== null)
      .map((c) => ({ id: c.id, displayName: c.displayName }));
  }

  /** The callback URL registered at the provider for this connector. */
  redirectUri(providerId: string): string {
    const base = (
      this.config.get<string>('FEDERATION_REDIRECT_BASE') ??
      this.config.get<string>('OIDC_ISSUER') ??
      'http://localhost:3002'
    ).replace(/\/$/, '');
    return `${base}/v1/auth/oauth/${providerId}/callback`;
  }

  /** Resolve config for an enabled provider; 404 if unknown/disabled. */
  resolveConfig(providerId: string): ProviderConfig {
    const cfg = this.tryResolveConfig(providerId);
    if (!cfg) {
      throw new NotFoundException(
        `Unknown or not-configured federation provider: ${providerId}`,
      );
    }
    return cfg;
  }

  /** Resolve a provider's endpoints (static or via cached OIDC discovery). */
  async getEndpoints(cfg: ProviderConfig): Promise<ProviderEndpoints> {
    if (cfg.endpoints) return cfg.endpoints;
    if (!cfg.issuer) {
      throw new BadRequestException(`Provider ${cfg.id} has no issuer configured`);
    }
    const cached = this.discoveryCache.get(cfg.issuer);
    if (cached && cached.expiresAt > Date.now()) return cached.endpoints;

    const url = `${cfg.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const doc = (await this.getJson(url, { Accept: 'application/json' })) as {
      authorization_endpoint?: string;
      token_endpoint?: string;
      userinfo_endpoint?: string;
    };
    const endpoints: ProviderEndpoints = {
      // Coerce to '' so the incompleteness guard below fires the same way it
      // did when a discovery field was missing (undefined).
      authorizationEndpoint: doc.authorization_endpoint ?? '',
      tokenEndpoint: doc.token_endpoint ?? '',
      userinfoEndpoint: doc.userinfo_endpoint,
    };
    if (!endpoints.authorizationEndpoint || !endpoints.tokenEndpoint) {
      throw new BadRequestException('OIDC discovery document is incomplete');
    }
    this.discoveryCache.set(cfg.issuer, {
      endpoints,
      expiresAt: Date.now() + DISCOVERY_TTL_MS,
    });
    return endpoints;
  }

  async exchangeCode(
    cfg: ProviderConfig,
    endpoints: ProviderEndpoints,
    grant: { code: string; codeVerifier?: string },
  ): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: grant.code,
      redirect_uri: this.redirectUri(cfg.id),
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    });
    if (grant.codeVerifier) body.set('code_verifier', grant.codeVerifier);

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

  async fetchProfile(
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
        }).catch((): unknown => []),
      ]);
      const emailList: Array<Record<string, unknown>> = Array.isArray(emails)
        ? (emails as Array<Record<string, unknown>>)
        : [];
      return normalizeGithubProfile(user as Record<string, unknown>, emailList);
    }

    const data = await this.getJson(
      endpoints.userinfoEndpoint as string,
      authHeader,
    );
    return cfg.id === 'google'
      ? normalizeGoogleProfile(data as Record<string, unknown>)
      : normalizeOidcProfile(data as Record<string, unknown>);
  }

  private async getJson(
    url: string,
    headers: Record<string, string>,
  ): Promise<unknown> {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new UnauthorizedException(
        `Provider profile request failed (HTTP ${res.status})`,
      );
    }
    return res.json();
  }

  /**
   * Resolve a provider's config. A DB row wins over env (hot-reloadable admin
   * config); an explicitly-disabled DB row suppresses the provider even when
   * env credentials exist. With no DB row we fall back to env (back-compat).
   */
  private tryResolveConfig(providerId: string): ProviderConfig | null {
    const db = this.store.getEntry(providerId);
    if (db) return db.enabled ? this.fromDbEntry(providerId, db) : null;
    return this.fromEnv(providerId);
  }

  /** Build provider config from a DB entry, merged with static metadata. */
  private fromDbEntry(id: string, db: FederationDbEntry): ProviderConfig | null {
    if (!db.clientId || !db.clientSecret) return null;
    if (id === 'google' || id === 'github') {
      const meta = STATIC_PROVIDERS[id];
      if (!meta) return null;
      return {
        id,
        displayName: db.displayName || meta.displayName,
        clientId: db.clientId,
        clientSecret: db.clientSecret,
        scopes: db.scopes.length ? db.scopes : meta.scopes,
        usesPkce: meta.usesPkce,
        endpoints: meta.endpoints,
      };
    }
    if (id === 'oidc') {
      if (!db.issuer) return null;
      return {
        id: 'oidc',
        displayName: db.displayName || 'Single Sign-On',
        clientId: db.clientId,
        clientSecret: db.clientSecret,
        scopes: db.scopes.length ? db.scopes : ['openid', 'email', 'profile'],
        usesPkce: true,
        endpoints: null,
        issuer: db.issuer,
      };
    }
    return null;
  }

  /** Build provider config from env, or null when credentials are absent. */
  private fromEnv(providerId: string): ProviderConfig | null {
    if (providerId === 'google' || providerId === 'github') {
      const prefix = providerId.toUpperCase();
      const clientId = this.config.get<string>(`${prefix}_CLIENT_ID`);
      const clientSecret = this.config.get<string>(`${prefix}_CLIENT_SECRET`);
      if (!clientId || !clientSecret) return null;
      const meta = STATIC_PROVIDERS[providerId];
      if (!meta) return null;
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
