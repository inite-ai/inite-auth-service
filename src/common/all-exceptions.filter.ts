import { Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request } from 'express';
import { createLogger } from './logger.service';

/**
 * Catch-all exception filter that adds structured server-side logging WITHOUT
 * changing any client-visible response.
 *
 * It extends Nest's BaseExceptionFilter and always delegates the actual
 * response emission to `super.catch()`, so:
 *   - HttpException bodies pass through byte-for-byte — critically, OAuth/OIDC
 *     RFC errors thrown as `new BadRequestException({ error: 'invalid_grant' })`
 *     keep their `{ error, error_description }` shape that RP clients parse.
 *   - Unknown (non-HttpException) errors still map to the default generic 500
 *     `{ statusCode: 500, message: 'Internal server error' }` — no internals leak.
 *
 * The only added behaviour is logging: 5xx and unhandled errors are recorded
 * with request context + stack, which previously went unstructured.
 */
@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  private readonly logger = createLogger('ExceptionFilter');

  override catch(exception: unknown, host: ArgumentsHost): void {
    const req = host.switchToHttp().getRequest<Request>();
    const where = `${req.method} ${req.originalUrl ?? req.url}`;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      // 4xx are client faults (bad grant, unauthorized, validation) — routine,
      // not logged as errors. 5xx thrown deliberately still warrant a record.
      if (status >= 500) {
        this.logger.error(`${where} -> ${status}`, exception.stack, {
          path: req.url,
        });
      }
      super.catch(exception, host);
      return;
    }

    // Truly unexpected: log the full stack so the 500 isn't silent.
    const message = exception instanceof Error ? exception.message : 'Unknown error';
    const stack = exception instanceof Error ? exception.stack : undefined;
    this.logger.error(`Unhandled error: ${where}: ${message}`, stack, {
      path: req.url,
    });
    super.catch(exception, host);
  }
}
