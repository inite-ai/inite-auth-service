import { Test, TestingModule } from '@nestjs/testing';
import { ParService } from '../par.service';
import { RedisService } from '../../common/redis.service';

describe('ParService', () => {
  let svc: ParService;
  let store: Map<string, string>;

  beforeEach(async () => {
    store = new Map();
    const redis = {
      set: jest.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
      getDel: jest.fn(async (k: string) => {
        const v = store.get(k);
        if (v !== undefined) store.delete(k);
        return v ?? null;
      }),
    } as unknown as RedisService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParService,
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    svc = module.get(ParService);
  });

  it('returns a request_uri with the spec-mandated urn prefix', async () => {
    const { requestUri, expiresIn } = await svc.push({
      clientId: 'app',
      redirectUri: 'https://app.example.com/cb',
      codeChallenge: 'abc',
      codeChallengeMethod: 'S256',
    });
    expect(requestUri).toMatch(/^urn:ietf:params:oauth:request_uri:/);
    expect(expiresIn).toBe(60);
  });

  it('consume() returns the pushed payload exactly once (single-use)', async () => {
    const { requestUri } = await svc.push({
      clientId: 'app',
      redirectUri: 'https://app.example.com/cb',
      state: 'xyz',
    });
    const first = await svc.consume(requestUri, 'app');
    expect(first?.state).toBe('xyz');
    const second = await svc.consume(requestUri, 'app');
    expect(second).toBeNull();
  });

  it('consume() refuses a request_uri presented by the wrong client', async () => {
    const { requestUri } = await svc.push({
      clientId: 'app-a',
      redirectUri: 'https://app-a.example.com/cb',
    });
    const result = await svc.consume(requestUri, 'app-b');
    expect(result).toBeNull();
  });

  it('consume() returns null for unknown request_uri', async () => {
    const result = await svc.consume(
      'urn:ietf:params:oauth:request_uri:bogus',
      'any',
    );
    expect(result).toBeNull();
  });

  it('consume() returns null for malformed (non-urn) values', async () => {
    expect(await svc.consume('not-a-urn', 'app')).toBeNull();
  });
});
