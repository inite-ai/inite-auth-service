import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  authorizeErrorMapper,
  OAuthErrorMapper,
  registerErrorMapper,
  tokenErrorMapper,
  toOAuthException,
} from './oauth-errors';

/**
 * Re-shapes an OAuth endpoint's errors into `{ error, error_description }`.
 *
 * Bodies that already carry an OAuth code pass through untouched; a Nest
 * default body gets the code its endpoint's mapper picks. Applied per route,
 * never globally, so the rest of the API keeps Nest's shape. Pipe errors pass
 * through here too (Nest runs pipes inside the intercepted handler); guard
 * errors (the throttlers' 429) do not, and need no code.
 */
@Injectable()
export class OAuthErrorInterceptor implements NestInterceptor {
  constructor(private readonly mapper: OAuthErrorMapper) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next
      .handle()
      .pipe(
        catchError((e: unknown) =>
          throwError(() => (e instanceof HttpException ? toOAuthException(e, this.mapper) : e)),
        ),
      );
  }
}

/** POST /oauth/token — RFC 6749 §5.2. */
export const tokenErrors = new OAuthErrorInterceptor(tokenErrorMapper);
/** GET /oauth/authorize — RFC 6749 §4.1.2.1 codes, answered directly. */
export const authorizeErrors = new OAuthErrorInterceptor(authorizeErrorMapper);
/** POST /oauth/register — RFC 7591 §3.2.2. */
export const registerErrors = new OAuthErrorInterceptor(registerErrorMapper);
