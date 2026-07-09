import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * OIDC Back-Channel Logout
 * (https://openid.net/specs/openid-connect-backchannel-1_0.html).
 *
 * On user logout the IdP POSTs a signed `logout_token` to each RP
 * that registered a `backchannelLogoutUri`. The RP validates the
 * token (same JWKS as id_tokens) and invalidates its own session.
 *
 * Key spec requirements honoured below:
 *   - logout_token MUST contain a "sid" (session id) OR "sub", we
 *     send both when available
 *   - the events claim MUST be exactly the canonical URI
 *   - logout_token MUST NOT contain a "nonce" claim (the OIDC spec
 *     uses its presence to distinguish from id_tokens)
 *   - jti is required and MUST be unique per logout event
 *   - exp/iat short window (we use 2 min)
 *
 * Delivery is best-effort with a hard timeout; if an RP is down,
 * its users will see a stale session until token expiry. Logging
 * lets operators chase up persistent failures.
 */
@Injectable()
export class BackchannelLogoutService {
  private readonly logger = new Logger(BackchannelLogoutService.name);
  private static readonly LOGOUT_TOKEN_TTL_S = 120;
  private static readonly DELIVERY_TIMEOUT_MS = 3000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Fan out signed logout_tokens to every active client that:
   *   - has an active refresh token for this user (so we don't
   *     spam clients the user never logged into)
   *   - has a backchannelLogoutUri registered
   *
   * Returns the count of RPs notified. Async; the caller should
   * await but the rest of /oauth/logout MUST NOT block on RP
   * responses past the per-call DELIVERY_TIMEOUT_MS budget.
   */
  async fanOut(opts: { userDid: string; sid?: string }): Promise<number> {
    const activeClients = await this.prisma.oAuthClient.findMany({
      where: {
        active: true,
        NOT: { backchannelLogoutUri: null },
        refreshTokens: {
          some: {
            revoked: false,
            user: { did: opts.userDid },
          },
        },
      },
      select: { clientId: true, backchannelLogoutUri: true },
    });

    if (activeClients.length === 0) return 0;

    const issuer = this.config.get<string>(
      'JWT_ISSUER',
      'http://localhost:3002',
    );

    const deliveries = activeClients.map(async (client) => {
      const token = this.buildLogoutToken({
        issuer,
        audience: client.clientId,
        sub: opts.userDid,
        sid: opts.sid,
      });
      await this.deliver(client.backchannelLogoutUri!, token, client.clientId);
    });

    const results = await Promise.allSettled(deliveries);
    return results.filter((r) => r.status === 'fulfilled').length;
  }

  private buildLogoutToken(opts: {
    issuer: string;
    audience: string;
    sub: string;
    sid?: string;
  }): string {
    const payload: Record<string, unknown> = {
      sub: opts.sub,
      events: {
        'http://schemas.openid.net/event/backchannel-logout': {},
      },
      jti: randomUUID(),
    };
    if (opts.sid) payload.sid = opts.sid;
    return this.jwt.sign(payload, {
      issuer: opts.issuer,
      audience: opts.audience,
      expiresIn: BackchannelLogoutService.LOGOUT_TOKEN_TTL_S,
    });
  }

  private async deliver(
    uri: string,
    logoutToken: string,
    clientId: string,
  ): Promise<void> {
    const controller = new AbortController();
    const t = setTimeout(
      () => controller.abort(),
      BackchannelLogoutService.DELIVERY_TIMEOUT_MS,
    );
    try {
      const res = await fetch(uri, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // Spec recommends Cache-Control to prevent intermediaries
          // caching a logout (it's a one-shot event).
          'Cache-Control': 'no-store',
        },
        body: new URLSearchParams({ logout_token: logoutToken }),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(
          `backchannel logout: ${clientId} returned ${res.status}`,
        );
      }
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : 'err';
      const message = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(
        `backchannel logout: ${clientId} delivery failed (${name}: ${message})`,
      );
    } finally {
      clearTimeout(t);
    }
  }
}
