import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { isDynamicClientId } from './oauth-scopes.registry';

@Injectable()
export class OAuthOriginsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  // Cache for allowed origins
  private allowedOriginsCache = new Set<string>();
  private allowedOriginsCacheTime = 0;

  /**
   * The origins this IdP trusts: FRONTEND_URL, CORS_ORIGINS and the redirect
   * origins of active first-party clients. Cached for 60s.
   *
   * Three things read this set: credentialed CORS, the choice of the
   * SameSite=None embed cookie, and the session-establish redirect. A
   * self-registered (`dcr_*`) client is never in it: registration is open
   * and unauthenticated, so its origins used to join all three within a
   * minute, an open redirect and a credentialed CORS hole for anyone.
   */
  async getAllowedOrigins(): Promise<Set<string>> {
    const now = Date.now();
    if (now - this.allowedOriginsCacheTime < 60_000 && this.allowedOriginsCache.size > 0) {
      return this.allowedOriginsCache;
    }

    const origins = new Set<string>();

    const frontendUrl = this.configService.get<string>('FRONTEND_URL', '');
    if (frontendUrl) origins.add(frontendUrl.replace(/\/$/, ''));

    const extra = this.configService.get<string>('CORS_ORIGINS', '');
    for (const o of extra.split(',').filter(Boolean)) {
      origins.add(o.replace(/\/$/, ''));
    }

    const clients = await this.prisma.oAuthClient.findMany({
      where: { active: true, firstParty: true, NOT: { clientId: { startsWith: 'dcr_' } } },
      select: { clientId: true, redirectUris: true },
    });
    for (const client of clients) {
      if (isDynamicClientId(client.clientId)) continue;
      for (const uri of client.redirectUris) {
        try { origins.add(new URL(uri).origin); } catch {}
      }
    }

    this.allowedOriginsCache = origins;
    this.allowedOriginsCacheTime = now;
    return origins;
  }

  /**
   * Check if an origin is allowed
   */
  async isAllowedOrigin(origin: string): Promise<boolean> {
    const allowed = await this.getAllowedOrigins();
    return allowed.has(origin);
  }

  /**
   * Synchronous cache read for hot paths that can't await — middleware
   * like session-cookie-mode selection or CSP-header rewriting. Returns
   * the most recent snapshot; the cache is refreshed by any concurrent
   * async caller. On a cold start this returns an empty Set, which
   * collapses to "default first-party only" behaviour until the cache
   * warms — fail-safe.
   */
  getAllowedOriginsSync(): Set<string> {
    return this.allowedOriginsCache;
  }
}
