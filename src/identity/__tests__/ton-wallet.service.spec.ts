import { BadRequestException } from '@nestjs/common';
import { TonWalletService } from '../ton-wallet.service';
import * as tonProof from '../ton-proof';

/**
 * Covers what the pure verifier cannot: the flag gate, and that an issued
 * payload buys exactly one attempt. The previous flow let the *client* pick
 * the nonce, so a captured proof stayed replayable forever.
 */
describe('TonWalletService', () => {
  const PAYLOAD = 'server-issued-nonce';

  let redis: { set: jest.Mock; getDel: jest.Mock };
  let settings: { flag: jest.Mock; value: jest.Mock };
  let identity: { getIdentityById: jest.Mock; persistWallet: jest.Mock };
  let service: TonWalletService;
  let verifySpy: jest.SpiedFunction<typeof tonProof.verifyTonProof>;

  const input = {
    userId: 'u1',
    address: '0:abc',
    publicKey: 'pk',
    walletStateInit: 'si',
    proof: {
      timestamp: 1,
      domain: { lengthBytes: 3, value: 'rp' },
      signature: 'sig',
      payload: PAYLOAD,
    },
  };

  beforeEach(() => {
    redis = { set: jest.fn(), getDel: jest.fn().mockResolvedValue(PAYLOAD) };
    settings = { flag: jest.fn().mockReturnValue(true), value: jest.fn().mockReturnValue('rp') };
    identity = {
      getIdentityById: jest.fn().mockResolvedValue({ id: 'u1' }),
      persistWallet: jest.fn().mockResolvedValue({ id: 'w1' }),
    };
    verifySpy = jest
      .spyOn(tonProof, 'verifyTonProof')
      .mockReturnValue({ valid: true });

    service = new TonWalletService(
      redis as never,
      settings as never,
      identity as never,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe('while the feature flag is off', () => {
    beforeEach(() => settings.flag.mockReturnValue(false));

    it('refuses to issue a payload', async () => {
      await expect(service.issuePayload('u1')).rejects.toThrow(BadRequestException);
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('refuses to link, without touching the stored nonce', async () => {
      await expect(service.linkWithProof(input)).rejects.toThrow(BadRequestException);
      expect(redis.getDel).not.toHaveBeenCalled();
    });
  });

  it('stores the issued payload under a TTL', async () => {
    const { payload, expiresInSeconds } = await service.issuePayload('u1');

    expect(payload).toMatch(/^[0-9a-f]{64}$/);
    expect(redis.set).toHaveBeenCalledWith('ton:proof:payload:u1', payload, expiresInSeconds);
  });

  it('mints a different payload every time', async () => {
    const first = await service.issuePayload('u1');
    const second = await service.issuePayload('u1');

    expect(first.payload).not.toEqual(second.payload);
  });

  it('links the address when the proof verifies', async () => {
    await expect(service.linkWithProof(input)).resolves.toEqual({ id: 'w1' });

    expect(identity.persistWallet).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', address: '0:abc', chain: 'ton' }),
    );
  });

  it('checks the proof against the payload the server issued, not the one sent', async () => {
    redis.getDel.mockResolvedValue('the-real-one');

    await service.linkWithProof(input);

    expect(verifySpy).toHaveBeenCalledWith(
      expect.objectContaining({ expectedPayload: 'the-real-one', expectedDomain: 'rp' }),
    );
  });

  it('rejects when no payload was issued', async () => {
    redis.getDel.mockResolvedValue(null);

    await expect(service.linkWithProof(input)).rejects.toThrow(BadRequestException);
    expect(verifySpy).not.toHaveBeenCalled();
  });

  it('consumes the payload even when verification fails, so a retry cannot reuse it', async () => {
    verifySpy.mockReturnValue({ valid: false, reason: 'bad-signature' });

    await expect(service.linkWithProof(input)).rejects.toThrow(BadRequestException);
    // getDel is the consumption — a second attempt finds nothing.
    expect(redis.getDel).toHaveBeenCalledWith('ton:proof:payload:u1');
    expect(identity.persistWallet).not.toHaveBeenCalled();
  });

  it('does not leak which check failed to the caller', async () => {
    verifySpy.mockReturnValue({ valid: false, reason: 'address-key-mismatch' });

    await expect(service.linkWithProof(input)).rejects.toThrow('Invalid TON wallet proof');
  });
});
