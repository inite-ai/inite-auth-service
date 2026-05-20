import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';

/**
 * Throttler that keys on the LOGIN EMAIL rather than the IP.
 *
 * Why: credential-stuffing botnets rotate IPs but probe a fixed list
 * of accounts. Per-IP throttling alone is insufficient because each
 * bot has plenty of IPs but only one target per attempt. Per-email
 * caps reduce the attack surface to one bucket per victim.
 *
 * The lockout (User.failedLoginCount + lockoutUntil) is the
 * authoritative defence; this guard is an upstream cap so the
 * lockout itself can't be hammered. Falls back to IP for requests
 * missing an email body (shouldn't happen on /password/login).
 */
@Injectable()
export class LoginEmailThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const email =
      typeof req?.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : null;
    if (email) return `login-email:${email}`;
    return `login-ip:${req?.ip ?? 'unknown'}`;
  }

  protected getRequestResponse(context: ExecutionContext) {
    const http = context.switchToHttp();
    return { req: http.getRequest(), res: http.getResponse() };
  }
}

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
