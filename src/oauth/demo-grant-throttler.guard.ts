import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerRequest } from '@nestjs/throttler';
import { Request } from 'express';
import { clientIp } from '../common/client-ip';
import {
  DEMO_RATE_PER_CLIENT,
  DEMO_RATE_PER_IP,
  DEMO_RATE_WINDOW_MS,
  isDemoGrantRequest,
} from './demo-grant';

/**
 * The demo grant's own buckets, one per client_id and one per address
 * (demo-grant.ts has the numbers and why). Every other token request skips
 * this guard and is limited by TokenEndpointThrottlerGuard alone. Both
 * buckets count every demo request, refused ones too, so a caller probing
 * personas or secrets runs out as fast as one minting tokens.
 */
@Injectable()
export class DemoGrantThrottlerGuard extends ThrottlerGuard {
  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const { req } = this.getRequestResponse(context);
    return !isDemoGrantRequest((req as Request).body);
  }

  protected override async handleRequest(props: ThrottlerRequest): Promise<boolean> {
    const window = { ...props, ttl: DEMO_RATE_WINDOW_MS, blockDuration: DEMO_RATE_WINDOW_MS };
    await super.handleRequest({
      ...window,
      limit: DEMO_RATE_PER_CLIENT,
      getTracker: async (req) => {
        const id = (req as Request).body?.client_id;
        return `oauth:demo:client:${typeof id === 'string' && id ? id : '-'}`;
      },
    });
    return super.handleRequest({
      ...window,
      limit: DEMO_RATE_PER_IP,
      // req.ip, set by clientIpMiddleware from trusted hops only.
      getTracker: async (req) => `oauth:demo:ip:${clientIp(req as Request)}`,
    });
  }
}
