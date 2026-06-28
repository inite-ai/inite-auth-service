import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

/**
 * Token-endpoint rate limit with per-client tracker.
 *
 * Stock @nestjs/throttler keys per IP, which is the right shape for
 * user-flow grants (authorization_code, refresh_token) where each
 * IP is roughly one human. M2M client_credentials flows are
 * different: many vertical-backend instances behind one load
 * balancer share one IP but represent different clients. Keying
 * those per-IP either starves them all when one client spikes, or
 * forces operators to raise the global limit to a useless ceiling.
 *
 * This guard returns the client_id as the tracker key for
 * client_credentials requests. Per-clientId isolation means one
 * misbehaving M2M consumer can't starve the others — and a brute-
 * force attempt against a specific client_id self-throttles.
 *
 * For user-flow grants and unauthenticated probes (no client_id /
 * no grant_type yet) we fall back to the default IP tracker so a
 * single source can't burst the endpoint.
 */
@Injectable()
export class TokenEndpointThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    const body = (req as any).body as Record<string, unknown> | undefined;
    const grant = typeof body?.grant_type === 'string' ? body.grant_type : '';
    const clientId =
      typeof body?.client_id === 'string' ? body.client_id : '';

    if (grant === 'client_credentials' && clientId) {
      return `oauth:token:cc:${clientId}`;
    }
    // Fall back to IP for user-flow grants. ThrottlerGuard's default
    // tracker prefers x-forwarded-for-derived IP, so we mirror that.
    const fwd = (req.headers['x-forwarded-for'] as string | undefined) ?? '';
    const ip = fwd.split(',')[0]?.trim() || req.ip || 'unknown';
    return `oauth:token:user:${ip}`;
  }
}
