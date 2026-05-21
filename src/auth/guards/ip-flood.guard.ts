import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { RedisService } from '../../common/redis.service';
import { OAuthAuditService } from '../../audit/oauth-audit.service';

/**
 * Horizontal credential-stuffing defence.
 *
 * The per-email throttler caps how many times a single email can be
 * probed in a window. That stops the "guess passwords for one
 * account" attack — but credential-stuffing botnets do the dual: try
 * one password against many accounts. From the per-email view each
 * attempt looks fine; from the IP view it's obviously a sweep.
 *
 * This guard tracks the SET of distinct emails attempted from each
 * IP over a 5-minute window. When the IP has touched more than
 * MAX_UNIQUE_EMAILS distinct accounts in that window, the request is
 * rejected with 429 and the event is audit-logged. The Redis SET TTL
 * means the bucket self-prunes — operators don't need to manage state.
 *
 * Intentionally permissive: 30 distinct emails / 5 min is well above
 * what any single human or shared NAT would do, but well below a
 * meaningful credential-stuffing sweep.
 */
@Injectable()
export class IpFloodGuard implements CanActivate {
  private readonly logger = new Logger(IpFloodGuard.name);

  private static readonly WINDOW_SECONDS = 300;
  private static readonly MAX_UNIQUE_EMAILS = 30;

  constructor(
    private readonly redis: RedisService,
    private readonly audit: OAuthAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const ip = this.extractIp(req);
    const email =
      typeof req?.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : null;

    if (!email || ip === 'unknown') {
      return true;
    }

    const key = `flood:login:ip:${ip}`;
    const distinct = await this.redis.sAddWithTtl(
      key,
      email,
      IpFloodGuard.WINDOW_SECONDS,
    );

    if (distinct > IpFloodGuard.MAX_UNIQUE_EMAILS) {
      // Audit + log are best-effort; never let an observability path
      // crash the guard and turn a soft block into a 500.
      this.audit
        .record({
          event: 'auth.flood.ip_blocked',
          ip,
          userAgent: (req?.headers?.['user-agent'] as string) ?? null,
          success: false,
          errorMessage: `IP probed ${distinct} distinct emails in ${IpFloodGuard.WINDOW_SECONDS}s`,
          metadata: {
            distinctEmails: distinct,
            windowSeconds: IpFloodGuard.WINDOW_SECONDS,
            limit: IpFloodGuard.MAX_UNIQUE_EMAILS,
          },
        })
        .catch((e: any) =>
          this.logger.warn(`audit write failed: ${e?.message ?? 'unknown'}`),
        );

      this.logger.warn(
        `IP flood: ${ip} probed ${distinct} distinct emails in ${IpFloodGuard.WINDOW_SECONDS}s`,
      );

      throw new HttpException(
        {
          message: 'Too many distinct accounts probed from this address',
          error: 'ip_flood',
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private extractIp(req: any): string {
    const fwd =
      (req?.headers?.['x-forwarded-for'] as string | undefined) ?? '';
    return fwd.split(',')[0]?.trim() || req?.ip || 'unknown';
  }
}
