import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import { Observable, of, from } from 'rxjs';
import { tap, switchMap } from 'rxjs/operators';
import { RedisService } from './redis.service';

/**
 * Idempotency-Key (draft-ietf-httpapi-idempotency-key).
 *
 * Apply via @UseInterceptors(IdempotencyInterceptor) on POST routes
 * that should never produce a duplicate side-effect when the
 * client retries on a flaky network. The flow:
 *
 *   1. Client sets `Idempotency-Key: <opaque 16-128 chars>` on the
 *      POST. Missing header → interceptor is a no-op (back-compat
 *      with callers that don't know about idempotency).
 *   2. Server keys the dedup record on (clientId|user|ip)+key so
 *      one client can't poison another's idempotency space.
 *   3. First call: run the handler; persist the response (status +
 *      JSON body) under that key with 24 h TTL.
 *   4. Retry within 24 h: serve the cached response without
 *      re-running the handler. Status code preserved.
 *
 * Replays of the same key with a DIFFERENT request body are
 * rejected with 400 — that's the spec's "key reuse with mismatched
 * payload" hazard.
 */
const TTL_SECONDS = 24 * 60 * 60;

interface CachedResponse {
  statusCode: number;
  body: unknown;
  bodyHash: string;
}

function hashBody(body: any): string {
  try {
    const serial = JSON.stringify(body ?? {}, Object.keys(body ?? {}).sort());
    return Buffer.from(serial).toString('base64url').slice(0, 64);
  } catch {
    return 'unhashable';
  }
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly redis: RedisService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const key = req.headers?.['idempotency-key'] as string | undefined;
    if (!key) return next.handle();

    if (key.length < 16 || key.length > 128) {
      throw new BadRequestException(
        'Idempotency-Key must be 16-128 characters',
      );
    }

    const actor =
      req.user?.userId ??
      req.user?.sub ??
      req.body?.client_id ??
      req.ip ??
      'anonymous';
    const redisKey = `idem:${actor}:${key}`;
    const bodyHash = hashBody(req.body);

    return from(this.redis.get(redisKey)).pipe(
      switchMap((cached) => {
        if (cached) {
          let parsed: CachedResponse;
          try {
            parsed = JSON.parse(cached) as CachedResponse;
          } catch {
            return next.handle(); // unparsable → safer to re-run
          }
          if (parsed.bodyHash !== bodyHash) {
            throw new BadRequestException(
              'Idempotency-Key reused with a different request body',
            );
          }
          res.status(parsed.statusCode);
          return of(parsed.body);
        }
        return next.handle().pipe(
          tap(async (body) => {
            const statusCode = res.statusCode ?? 200;
            const payload: CachedResponse = { statusCode, body, bodyHash };
            try {
              await this.redis.set(
                redisKey,
                JSON.stringify(payload),
                TTL_SECONDS,
              );
            } catch {
              /* swallow — caching is best-effort */
            }
          }),
        );
      }),
    );
  }
}
