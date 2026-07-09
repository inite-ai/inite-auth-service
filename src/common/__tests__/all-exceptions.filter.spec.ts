import { ArgumentsHost, BadRequestException, HttpException } from '@nestjs/common';
import { AllExceptionsFilter } from '../all-exceptions.filter';

/**
 * The filter must be transparent to clients: it delegates emission to
 * BaseExceptionFilter, which calls the injected http adapter's reply(res, body,
 * status). So OAuth RFC error bodies survive untouched and unknown errors still
 * map to a generic 500. We assert on what the adapter is told to reply.
 */
describe('AllExceptionsFilter', () => {
  let reply: jest.Mock;
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    reply = jest.fn();
    const httpAdapter = { reply, isHeadersSent: () => false, end: jest.fn() };
    filter = new AllExceptionsFilter(httpAdapter as never);
  });

  const host = (): ArgumentsHost => {
    const req = { method: 'POST', url: '/v1/oauth/token', originalUrl: '/v1/oauth/token' };
    const res = {};
    const args = [req, res];
    return {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
      // BaseExceptionFilter reads the response via getArgByIndex(1).
      getArgByIndex: (i: number) => args[i],
    } as unknown as ArgumentsHost;
  };

  it('passes an OAuth RFC error body through unchanged with its status', () => {
    filter.catch(new BadRequestException({ error: 'invalid_grant' }), host());
    const [, body, status] = reply.mock.calls[0];
    expect(body).toEqual({ error: 'invalid_grant' });
    expect(status).toBe(400);
  });

  it('preserves a custom HttpException status (e.g. 401)', () => {
    filter.catch(new HttpException({ error: 'invalid_token' }, 401), host());
    const [, body, status] = reply.mock.calls[0];
    expect(status).toBe(401);
    expect(body).toEqual({ error: 'invalid_token' });
  });

  it('maps an unknown (non-HttpException) error to a generic 500 without leaking internals', () => {
    filter.catch(new Error('boom: db down'), host());
    const [, body, status] = reply.mock.calls[0];
    expect(status).toBe(500);
    expect(body).toMatchObject({ statusCode: 500, message: 'Internal server error' });
    expect(JSON.stringify(body)).not.toContain('db down');
  });
});
