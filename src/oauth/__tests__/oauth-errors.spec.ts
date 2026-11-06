import {
  BadRequestException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { lastValueFrom, throwError } from 'rxjs';
import {
  authorizeErrorMapper,
  dcrError,
  OAuthErrorMapper,
  tokenErrorMapper,
  toOAuthException,
} from '../oauth-errors';
import { OAuthErrorInterceptor } from '../oauth-error.interceptor';

function shaped(e: HttpException, mapper: OAuthErrorMapper) {
  const out = toOAuthException(e, mapper);
  return { status: out.getStatus(), body: out.getResponse() };
}

describe('token endpoint errors (RFC 6749 §5.2)', () => {
  it.each([
    [new BadRequestException('grant_type is required'), 400, 'invalid_request'],
    [new BadRequestException('Unsupported grant_type'), 400, 'unsupported_grant_type'],
    [
      new BadRequestException('Grant type "client_credentials" is not allowed for this client'),
      400,
      'unauthorized_client',
    ],
    [new BadRequestException('Invalid or expired authorization code'), 400, 'invalid_grant'],
    [new BadRequestException('Invalid code verifier'), 400, 'invalid_grant'],
    [
      new BadRequestException('subject_token or actor_token is invalid or expired'),
      400,
      'invalid_grant',
    ],
    [new BadRequestException('code_verifier is required (PKCE)'), 400, 'invalid_request'],
    [new BadRequestException('Scope(s) not allowed for this client: admin'), 400, 'invalid_scope'],
    [
      new BadRequestException('Resource "https://x" is not allowed for this client'),
      400,
      'invalid_target',
    ],
    [new UnauthorizedException('Invalid client credentials'), 401, 'invalid_client'],
    [new UnauthorizedException('client_assertion replayed (jti reuse)'), 401, 'invalid_client'],
    // RFC 9449 §5: a bad DPoP proof is not a client authentication failure.
    [new UnauthorizedException('DPoP proof replayed'), 400, 'invalid_dpop_proof'],
    [new BadRequestException('DPoP proof: htm mismatch'), 400, 'invalid_dpop_proof'],
  ])('%s -> %i %s', (e, status, error) => {
    const out = shaped(e, tokenErrorMapper);
    expect(out.status).toBe(status);
    expect(out.body).toEqual({ error, error_description: e.message });
  });

  it('passes an already-coded body through untouched', () => {
    const e = new BadRequestException({ error: 'authorization_pending' });
    expect(toOAuthException(e, tokenErrorMapper)).toBe(e);
  });

  it('leaves statuses it has no code for alone (rate limits, server errors)', () => {
    const e = new HttpException('Too Many Requests', 429);
    expect(toOAuthException(e, tokenErrorMapper)).toBe(e);
  });

  it('keeps the description as the exception message, for logs and audit', () => {
    const out = toOAuthException(new BadRequestException('code is required'), tokenErrorMapper);
    expect(out.message).toBe('code is required');
  });
});

describe('authorize endpoint errors (RFC 6749 §4.1.2.1)', () => {
  it.each([
    ['Invalid response_type. Only "code" is supported.', 'unsupported_response_type'],
    ['code_challenge is required (PKCE)', 'invalid_request'],
    ['Invalid redirect_uri', 'invalid_request'],
    ['Invalid or expired request_uri', 'invalid_request_uri'],
    ['malformed request object', 'invalid_request_object'],
    ['Grant type "authorization_code" is not allowed for this client', 'unauthorized_client'],
  ])('%s -> %s', (message, error) => {
    const out = shaped(new BadRequestException(message), authorizeErrorMapper);
    expect(out).toEqual({ status: 400, body: { error, error_description: message } });
  });

  it('an unknown client stays a 401, now with a code', () => {
    const out = shaped(new UnauthorizedException('Invalid client'), authorizeErrorMapper);
    expect(out).toEqual({
      status: 401,
      body: { error: 'invalid_client', error_description: 'Invalid client' },
    });
  });

  it('leaves a 404 alone', () => {
    const e = new NotFoundException('nope');
    expect(toOAuthException(e, authorizeErrorMapper)).toBe(e);
  });
});

describe('dcrError', () => {
  it('builds an RFC 7591 §3.2.2 body and keeps the text as the message', () => {
    const e = dcrError('invalid_redirect_uri', 'redirect_uris is required');
    expect(e.getStatus()).toBe(400);
    expect(e.getResponse()).toEqual({
      error: 'invalid_redirect_uri',
      error_description: 'redirect_uris is required',
    });
    expect(e.message).toBe('redirect_uris is required');
  });
});

describe('OAuthErrorInterceptor', () => {
  const run = (err: unknown) =>
    lastValueFrom(
      new OAuthErrorInterceptor(tokenErrorMapper).intercept({} as never, {
        handle: () => throwError(() => err),
      }),
    );

  it('re-shapes an HttpException on its way out', async () => {
    await expect(run(new BadRequestException('Unsupported grant_type'))).rejects.toMatchObject({
      response: { error: 'unsupported_grant_type', error_description: 'Unsupported grant_type' },
    });
  });

  it('lets a non-HTTP error through for the global filter to 500', async () => {
    const boom = new Error('db down');
    await expect(run(boom)).rejects.toBe(boom);
  });
});
