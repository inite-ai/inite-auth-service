import { Injectable, PipeTransform, ValidationError, ValidationPipe } from '@nestjs/common';
import { RegisterClientDto } from './dto/register-client.dto';
import { dcrError } from './oauth-errors';

/**
 * Validates RFC 7591 registration metadata and drops what it does not know.
 *
 * RFC 7591 §3.1: the server MUST ignore client metadata it does not
 * understand. The app's global ValidationPipe forbids unknown properties, so
 * the register route takes its body untyped (the global pipe then has no
 * class to check) and this pipe does the work with `whitelist` stripping
 * instead of refusing. Declared fields stay strictly validated, and a failure
 * answers in RFC 7591 §3.2.2 shape: `invalid_redirect_uri` when
 * redirect_uris is at fault, `invalid_client_metadata` otherwise.
 *
 * Whitelisting an allow-list of field names (the September fix) cannot keep
 * up: every new field a client starts sending broke registration again.
 */
@Injectable()
export class DcrMetadataPipe implements PipeTransform<unknown, Promise<RegisterClientDto>> {
  private readonly inner = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    exceptionFactory: (errors: ValidationError[]) => toDcrError(errors),
  });

  async transform(value: unknown): Promise<RegisterClientDto> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw dcrError('invalid_client_metadata', 'the request body must be a JSON object');
    }
    return (await this.inner.transform(value, {
      type: 'body',
      metatype: RegisterClientDto,
    })) as RegisterClientDto;
  }
}

function constraintsOf(error: ValidationError): string[] {
  const own = Object.values(error.constraints ?? {});
  const nested = (error.children ?? []).flatMap(constraintsOf);
  return [...own, ...nested];
}

function toDcrError(errors: ValidationError[]) {
  const description = errors.flatMap(constraintsOf).join('; ') || 'invalid client metadata';
  const code = errors.some((e) => e.property === 'redirect_uris')
    ? 'invalid_redirect_uri'
    : 'invalid_client_metadata';
  return dcrError(code, description);
}
