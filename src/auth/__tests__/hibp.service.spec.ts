import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HibpService } from '../hibp.service';

describe('HibpService', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  const build = async (envOverrides: Record<string, string> = {}) => {
    const env: Record<string, string> = {
      HIBP_ENABLED: 'true',
      HIBP_MIN_BREACH_COUNT: '1',
      HIBP_TIMEOUT_MS: '500',
      HIBP_API_BASE: 'https://api.test',
      ...envOverrides,
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        HibpService,
        {
          provide: ConfigService,
          useValue: { get: (k: string, dflt?: string) => env[k] ?? dflt },
        },
      ],
    }).compile();
    return mod.get(HibpService);
  };

  it('isEnabled honours HIBP_ENABLED=false', async () => {
    const svc = await build({ HIBP_ENABLED: 'false' });
    expect(svc.isEnabled()).toBe(false);
    // breachCount short-circuits to 0 when disabled
    expect(await svc.breachCount('hunter2')).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 0 when the suffix is not in the response', async () => {
    const svc = await build();
    // SHA1("hunter2") = F3BBBD66A63D4BF1747940578EC3D0103530E21D
    // prefix = F3BBB, suffix = D66A63D4BF1747940578EC3D0103530E21D
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1\nBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:5\n',
    });
    expect(await svc.breachCount('hunter2')).toBe(0);
  });

  it('returns the breach count when the suffix is found', async () => {
    const svc = await build();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        'D66A63D4BF1747940578EC3D0103530E21D:42\nOTHER:99\n',
    });
    expect(await svc.breachCount('hunter2')).toBe(42);
  });

  it('assertNotBreached() throws when count crosses threshold', async () => {
    const svc = await build({ HIBP_MIN_BREACH_COUNT: '10' });
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => 'D66A63D4BF1747940578EC3D0103530E21D:11\n',
    });
    await expect(svc.assertNotBreached('hunter2')).rejects.toMatchObject({
      code: 'password_breached',
      breachCount: 11,
    });
  });

  it('assertNotBreached() passes when count below threshold', async () => {
    const svc = await build({ HIBP_MIN_BREACH_COUNT: '100' });
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => 'D66A63D4BF1747940578EC3D0103530E21D:5\n',
    });
    await expect(svc.assertNotBreached('hunter2')).resolves.toBeUndefined();
  });

  it('treats HIBP non-2xx as "not breached" (fail-open)', async () => {
    const svc = await build();
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    expect(await svc.breachCount('hunter2')).toBe(0);
  });

  it('treats HIBP fetch failure as "not breached" (fail-open)', async () => {
    const svc = await build();
    fetchMock.mockRejectedValue(new Error('boom'));
    expect(await svc.breachCount('hunter2')).toBe(0);
  });

  it('sends only the first 5 hex chars to HIBP (k-anonymity)', async () => {
    const svc = await build();
    fetchMock.mockResolvedValue({ ok: true, text: async () => '' });
    await svc.breachCount('hunter2');
    const url = fetchMock.mock.calls[0][0];
    // SHA1("hunter2") starts with F3BBB.
    expect(url).toBe('https://api.test/range/F3BBB');
    // Add-Padding header set per HIBP recommendation
    expect(fetchMock.mock.calls[0][1].headers['Add-Padding']).toBe('true');
  });
});
