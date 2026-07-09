import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Throttler that keys on the authenticated user's id when present,
 * otherwise the IP. Use on endpoints that sit behind JwtAuthGuard.
 */
@Injectable()
export class UserOrIpThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    const user = req.user as { userId?: unknown; sub?: unknown } | undefined;
    const userId = user?.userId ?? user?.sub ?? null;
    if (userId) return `user:${String(userId)}`;
    const ip = typeof req.ip === 'string' ? req.ip : 'unknown';
    return `ip:${ip}`;
  }

  protected override getRequestResponse(context: ExecutionContext) {
    const http = context.switchToHttp();
    return { req: http.getRequest(), res: http.getResponse() };
  }
}
