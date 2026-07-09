import { requestContext } from '../request-context';
import { RequestContextMiddleware } from '../request-context.middleware';

describe('requestContext', () => {
  it('returns undefined outside of a run() scope', () => {
    expect(requestContext.get()).toBeUndefined();
    expect(requestContext.getRequestId()).toBeUndefined();
  });

  it('surfaces requestId inside the scope', () => {
    requestContext.run(
      { requestId: 'req-1', ip: '127.0.0.1', userAgent: 'Test/1.0' },
      () => {
        expect(requestContext.getRequestId()).toBe('req-1');
        expect(requestContext.get()?.ip).toBe('127.0.0.1');
      },
    );
  });

  it('keeps separate scopes isolated', async () => {
    await Promise.all([
      new Promise<void>((resolve) => {
        void requestContext.run({ requestId: 'A' }, async () => {
          await new Promise((r) => setTimeout(r, 5));
          expect(requestContext.getRequestId()).toBe('A');
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        void requestContext.run({ requestId: 'B' }, async () => {
          await new Promise((r) => setTimeout(r, 5));
          expect(requestContext.getRequestId()).toBe('B');
          resolve();
        });
      }),
    ]);
  });
});

describe('RequestContextMiddleware', () => {
  const make = () => {
    const middleware = new RequestContextMiddleware();
    return middleware;
  };

  const mkReq = (headers: any = {}, ip = '10.0.0.1') => ({
    headers,
    ip,
  }) as any;

  const mkRes = () => {
    const headers: Record<string, string> = {};
    return {
      setHeader: jest.fn((k: string, v: string) => {
        headers[k] = v;
      }),
      _headers: headers,
    } as any;
  };

  it('generates a UUID when X-Request-Id absent', (done) => {
    const middleware = make();
    const req = mkReq();
    const res = mkRes();
    middleware.use(req, res, () => {
      const id = requestContext.getRequestId();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(res._headers['X-Request-Id']).toBe(id);
      done();
    });
  });

  it('honours an inbound X-Request-Id', (done) => {
    const middleware = make();
    const req = mkReq({ 'x-request-id': 'upstream-abc' });
    const res = mkRes();
    middleware.use(req, res, () => {
      expect(requestContext.getRequestId()).toBe('upstream-abc');
      expect(res._headers['X-Request-Id']).toBe('upstream-abc');
      done();
    });
  });

  it('rejects an absurdly long X-Request-Id and generates a fresh UUID', (done) => {
    const middleware = make();
    const long = 'x'.repeat(500);
    const req = mkReq({ 'x-request-id': long });
    const res = mkRes();
    middleware.use(req, res, () => {
      const id = requestContext.getRequestId()!;
      expect(id.length).toBe(36); // UUID
      expect(id).not.toBe(long);
      done();
    });
  });

  it('extracts client IP from X-Forwarded-For when present', (done) => {
    const middleware = make();
    const req = mkReq({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' });
    const res = mkRes();
    middleware.use(req, res, () => {
      expect(requestContext.get()?.ip).toBe('203.0.113.5');
      done();
    });
  });
});
