import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { scimError, SCIM_CONTENT_TYPE } from './scim.contracts';

/**
 * Reshape any error thrown from a SCIM handler into the RFC 7644 §3.12 Error
 * envelope with the `application/scim+json` content type — provisioning clients
 * (Okta/Entra) parse this shape, not NestJS's default `{ statusCode, message }`.
 * Applied per-controller via @UseFilters so the OAuth RFC error shapes on other
 * routes are untouched.
 */
@Catch()
export class ScimExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let detail = 'internal server error';
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      detail = extractDetail(exception) ?? exception.message;
    } else if (exception instanceof Error) {
      detail = exception.message;
    }

    // §3.3 — a create colliding with an existing resource is a uniqueness error.
    const scimType = status === HttpStatus.CONFLICT ? 'uniqueness' : undefined;
    res.status(status).type(SCIM_CONTENT_TYPE).json(scimError(status, detail, scimType));
  }
}

/** Pull a human-readable detail string out of a Nest HttpException body. */
function extractDetail(exception: HttpException): string | undefined {
  const body = exception.getResponse();
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object') {
    const message = (body as { message?: unknown }).message;
    if (Array.isArray(message)) return message.join('; ');
    if (typeof message === 'string') return message;
  }
  return undefined;
}
