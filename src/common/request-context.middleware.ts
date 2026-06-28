import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { requestContext } from './request-context';

/**
 * Stamp every request with a correlation ID stored in
 * AsyncLocalStorage, plus echo it back via `X-Request-Id` so the
 * caller can quote it in support tickets.
 *
 * If the inbound request already carries `X-Request-Id` (e.g. from
 * an upstream proxy or another service in the same trace), keep it
 * verbatim so logs span the chain. Length-cap at 128 chars to
 * prevent log injection.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = (req.headers['x-request-id'] as string | undefined) ?? '';
    const requestId =
      incoming && incoming.length > 0 && incoming.length <= 128
        ? incoming
        : randomUUID();

    res.setHeader('X-Request-Id', requestId);

    const fwd = (req.headers['x-forwarded-for'] as string | undefined) ?? '';
    const ip = fwd.split(',')[0]?.trim() || req.ip || '';
    const userAgent =
      (req.headers['user-agent'] as string | undefined) ?? '';

    requestContext.run({ requestId, ip, userAgent }, () => next());
  }
}
