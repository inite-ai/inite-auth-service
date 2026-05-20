import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { IdempotencyInterceptor } from '../idempotency.interceptor';

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let store: Map<string, string>;
  let redis: any;

  beforeEach(() => {
    store = new Map();
    redis = {
      get: jest.fn(async (k: string) => store.get(k) ?? null),
      set: jest.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
    };
    interceptor = new IdempotencyInterceptor(redis as any);
  });

  const mkCtx = (
    headers: Record<string, string>,
    body: any = {},
    user?: any,
  ): ExecutionContext => ({
    switchToHttp: () => ({
      getRequest: () => ({ headers, body, ip: '10.0.0.1', user }),
      getResponse: () => ({
        status: jest.fn(),
        statusCode: 200,
      }),
    }),
  }) as any;

  it('no-ops when Idempotency-Key header is absent', async () => {
    const handler = { handle: jest.fn().mockReturnValue(of({ ok: 1 })) };
    const ctx = mkCtx({});
    const result = await firstValueFrom(interceptor.intercept(ctx, handler as any));
    expect(result).toEqual({ ok: 1 });
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('rejects keys shorter than 16 chars', () => {
    const handler = { handle: jest.fn() };
    const ctx = mkCtx({ 'idempotency-key': 'short' });
    expect(() => interceptor.intercept(ctx, handler as any)).toThrow(
      BadRequestException,
    );
  });

  it('runs the handler and caches the response on the first call', async () => {
    const handler = { handle: jest.fn().mockReturnValue(of({ token: 'jwt' })) };
    const ctx = mkCtx(
      { 'idempotency-key': 'a-long-enough-idempotency-key-1' },
      { grant_type: 'client_credentials', client_id: 'app' },
    );
    const result = await firstValueFrom(interceptor.intercept(ctx, handler as any));
    expect(result).toEqual({ token: 'jwt' });
    expect(handler.handle).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalled();
  });

  it('replays the cached response without calling the handler on retry', async () => {
    const key = 'a-long-enough-idempotency-key-1';
    const body = { grant_type: 'client_credentials', client_id: 'app' };

    const firstHandler = {
      handle: jest.fn().mockReturnValue(of({ token: 'jwt' })),
    };
    await firstValueFrom(
      interceptor.intercept(
        mkCtx({ 'idempotency-key': key }, body),
        firstHandler as any,
      ),
    );

    // Retry — handler should NOT run, cached body returned.
    const replayHandler = {
      handle: jest.fn().mockReturnValue(of({ token: 'should-not-run' })),
    };
    const result = await firstValueFrom(
      interceptor.intercept(
        mkCtx({ 'idempotency-key': key }, body),
        replayHandler as any,
      ),
    );
    expect(result).toEqual({ token: 'jwt' });
    expect(replayHandler.handle).not.toHaveBeenCalled();
  });

  it('rejects same key with a different body (RFC anti-poison)', async () => {
    const key = 'a-long-enough-idempotency-key-1';
    const handler = {
      handle: jest.fn().mockReturnValue(of({ token: 'jwt' })),
    };

    await firstValueFrom(
      interceptor.intercept(
        mkCtx({ 'idempotency-key': key }, { grant_type: 'client_credentials' }),
        handler as any,
      ),
    );

    const replayHandler = {
      handle: jest.fn().mockReturnValue(of({ token: 'whatever' })),
    };

    let caught: any;
    try {
      await firstValueFrom(
        interceptor.intercept(
          mkCtx({ 'idempotency-key': key }, { grant_type: 'refresh_token' }),
          replayHandler as any,
        ),
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect(replayHandler.handle).not.toHaveBeenCalled();
  });

  it('partitions cache by actor — different users with same key do not collide', async () => {
    const key = 'a-long-enough-idempotency-key-1';
    const body = { x: 1 };

    const userAHandler = {
      handle: jest.fn().mockReturnValue(of({ token: 'A' })),
    };
    await firstValueFrom(
      interceptor.intercept(
        mkCtx({ 'idempotency-key': key }, body, { userId: 'A' }),
        userAHandler as any,
      ),
    );

    const userBHandler = {
      handle: jest.fn().mockReturnValue(of({ token: 'B' })),
    };
    const result = await firstValueFrom(
      interceptor.intercept(
        mkCtx({ 'idempotency-key': key }, body, { userId: 'B' }),
        userBHandler as any,
      ),
    );
    // User B sees their own response — no leak from A.
    expect(result).toEqual({ token: 'B' });
    expect(userBHandler.handle).toHaveBeenCalledTimes(1);
  });
});
