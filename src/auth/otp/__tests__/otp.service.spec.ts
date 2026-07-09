import { OtpService } from '../otp.service';

/**
 * Unit coverage for the OTP factor core. A tiny in-memory fake stands in for
 * Redis (honours NX for setIfAbsent). We capture the generated code off the
 * email mock since it's random, then drive verify() through its branches:
 * success (single-use burn), wrong-attempt lockout, expiry, cooldown, and the
 * SMS-not-configured guard.
 */

function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    set: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    get: jest.fn(async (k: string) => (store.has(k) ? store.get(k)! : null)),
    del: jest.fn(async (k: string) => {
      store.delete(k);
    }),
    getDel: jest.fn(async (k: string) => {
      const v = store.get(k) ?? null;
      store.delete(k);
      return v;
    }),
    setIfAbsent: jest.fn(async (k: string, v: string) => {
      if (store.has(k)) return false;
      store.set(k, v);
      return true;
    }),
  };
}

function setup(opts: { smsEnabled?: boolean } = {}) {
  const redis = fakeRedis();
  let captured = '';
  const email = {
    sendOtpCode: jest.fn(async (_to: string, code: string) => {
      captured = code;
      return true;
    }),
  };
  const sms = {
    name: 'fake',
    enabled: !!opts.smsEnabled,
    send: jest.fn(async () => true),
  };
  const verifiedUser = {
    id: 'u1',
    did: 'did:key:1',
    email: 'a@example.com',
    name: 'A',
    emailVerified: true,
  };
  const prisma = {
    user: {
      findUnique: jest.fn(async () => verifiedUser),
      update: jest.fn(async () => verifiedUser),
    },
  };
  const identityService = { createIdentity: jest.fn() };

  const service = new OtpService(
    prisma as unknown as ConstructorParameters<typeof OtpService>[0],
    redis as unknown as ConstructorParameters<typeof OtpService>[1],
    email as unknown as ConstructorParameters<typeof OtpService>[2],
    identityService as unknown as ConstructorParameters<typeof OtpService>[3],
    sms as unknown as ConstructorParameters<typeof OtpService>[4],
  );
  return { service, redis, email, sms, prisma, getCode: () => captured };
}

describe('OtpService', () => {
  it('emails a code and verifies it once (single-use)', async () => {
    const { service, email, getCode } = setup();
    await service.requestEmailLoginCode('a@example.com');
    expect(email.sendOtpCode).toHaveBeenCalledTimes(1);

    const res = await service.verifyEmailLoginCode('a@example.com', getCode());
    expect(res.user.id).toBe('u1');

    // Replaying the same code fails — it was burned on success.
    await expect(
      service.verifyEmailLoginCode('a@example.com', getCode()),
    ).rejects.toThrow(/invalid or expired/i);
  });

  it('locks out after MAX_ATTEMPTS wrong codes', async () => {
    const { service, getCode } = setup();
    await service.requestEmailLoginCode('a@example.com');
    const wrong = getCode() === '000000' ? '111111' : '000000';

    for (let i = 0; i < 4; i++) {
      await expect(
        service.verifyEmailLoginCode('a@example.com', wrong),
      ).rejects.toThrow(/invalid or expired/i);
    }
    // 5th wrong attempt burns the code with a distinct lockout message.
    await expect(
      service.verifyEmailLoginCode('a@example.com', wrong),
    ).rejects.toThrow(/too many/i);
    // …and the (correct) code no longer works.
    await expect(
      service.verifyEmailLoginCode('a@example.com', getCode()),
    ).rejects.toThrow(/invalid or expired/i);
  });

  it('rejects an expired code', async () => {
    const { service, redis, getCode } = setup();
    await service.requestEmailLoginCode('a@example.com');

    // Force the stored record to be in the past.
    const key = 'otp:code:login:email:a@example.com';
    const rec = JSON.parse(redis.store.get(key)!);
    rec.expiresAt = Date.now() - 1000;
    redis.store.set(key, JSON.stringify(rec));

    await expect(
      service.verifyEmailLoginCode('a@example.com', getCode()),
    ).rejects.toThrow(/invalid or expired/i);
  });

  it('enforces a per-subject cooldown between sends', async () => {
    const { service } = setup();
    await service.requestEmailLoginCode('a@example.com');
    await expect(
      service.requestEmailLoginCode('a@example.com'),
    ).rejects.toThrow(/wait/i);
  });

  it('refuses the SMS channel when the provider is not configured', async () => {
    const { service } = setup({ smsEnabled: false });
    await expect(
      service.requestMfaCode('u1', 'sms', '+14155550123'),
    ).rejects.toThrow(/not configured/i);
  });
});
