import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

/**
 * Throttler that keys per client_id when one is present in the body,
 * falling back to IP otherwise.
 *
 * Used by /oauth/revoke and /oauth/introspect — both endpoints
 * authenticate via client credentials in the body. If we keyed per-IP,
 * a vertical-backend fleet behind one load balancer would self-starve
 * across unrelated clients. Per-client isolates one misbehaving caller
 * and self-throttles a brute-force probe against a specific client_id.
 */
@Injectable()
export class ClientIdThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    const body = (req as any).body as Record<string, unknown> | undefined;
    const clientId =
      typeof body?.client_id === 'string' ? body.client_id : '';
    if (clientId) {
      return `oauth:client:${clientId}`;
    }
    const fwd = (req.headers['x-forwarded-for'] as string | undefined) ?? '';
    const ip = fwd.split(',')[0]?.trim() || req.ip || 'unknown';
    return `oauth:ip:${ip}`;
  }
}
