import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Throttler that keys on the authenticated user's id when present,
 * otherwise the IP. Use on endpoints that sit behind JwtAuthGuard.
 */
@Injectable()
export class UserOrIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId = req?.user?.userId ?? req?.user?.sub ?? null;
    if (userId) return `user:${userId}`;
    return `ip:${req?.ip ?? 'unknown'}`;
  }

  protected getRequestResponse(context: ExecutionContext) {
    const http = context.switchToHttp();
    return { req: http.getRequest(), res: http.getResponse() };
  }
}
