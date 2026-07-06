import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ethers } from 'ethers';
import { WalletAuthService } from '../wallet-auth.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../common/redis.service';
import { IdentityService } from '../../../identity/identity.service';

describe('WalletAuthService', () => {
  let service: WalletAuthService;
  let store: Map<string, string>;
  let prisma: { wallet: { findUnique: jest.Mock; create: jest.Mock } };
  let identity: { createIdentity: jest.Mock };

  const config = {
    get: (key: string, def?: string) =>
      key === 'RP_ID'
        ? 'localhost'
        : key === 'RP_ORIGIN'
          ? 'http://localhost:3000'
          : def,
  };

  beforeEach(async () => {
    store = new Map();
    const redis = {
      set: jest.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
      getDel: jest.fn(async (k: string) => {
        const v = store.get(k) ?? null;
        store.delete(k);
        return v;
      }),
      get: jest.fn(async (k: string) => store.get(k) ?? null),
      del: jest.fn(),
    };
    prisma = {
      wallet: { findUnique: jest.fn(), create: jest.fn() },
    };
    identity = { createIdentity: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WalletAuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: IdentityService, useValue: identity },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get(WalletAuthService);
  });

  it('(a) stores the nonce and returns a sign-in message', async () => {
    const addr = '0x' + '1'.repeat(40);
    const { message, nonce } = await service.createSiweChallenge(addr);

    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(message).toContain('sign in');
    expect(message).toContain(`Nonce: ${nonce}`);
    expect(store.get('siwe:login:' + nonce)).toBe(addr.toLowerCase());
  });

  it('rejects an invalid EVM address', async () => {
    await expect(service.createSiweChallenge('not-an-address')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('(b) verifies a good signature, JIT-creates the user, links wallet', async () => {
    const wallet = ethers.Wallet.createRandom();
    const { message } = await service.createSiweChallenge(wallet.address);
    const signature = await wallet.signMessage(message);

    const fakeUser = { id: 'u1', did: 'did:x', email: null, name: null };
    identity.createIdentity.mockResolvedValue(fakeUser);
    prisma.wallet.findUnique.mockResolvedValue(null);
    prisma.wallet.create.mockResolvedValue({});

    const result = await service.verifySiweLogin(message, signature);

    expect(result.isNewUser).toBe(true);
    expect(result.user).toBe(fakeUser);
    expect(prisma.wallet.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        address: wallet.address.toLowerCase(),
        chain: 'eip155:1',
        signature,
        message,
      }),
    });
  });

  it('returns the existing user for a known wallet (isNewUser:false)', async () => {
    const wallet = ethers.Wallet.createRandom();
    const { message } = await service.createSiweChallenge(wallet.address);
    const signature = await wallet.signMessage(message);

    const existingUser = { id: 'u2', did: 'did:y', email: null, name: null };
    prisma.wallet.findUnique.mockResolvedValue({ user: existingUser });

    const result = await service.verifySiweLogin(message, signature);

    expect(result.isNewUser).toBe(false);
    expect(result.user).toBe(existingUser);
    expect(identity.createIdentity).not.toHaveBeenCalled();
  });

  it('(c) replay: a second verify with the same nonce is rejected', async () => {
    const wallet = ethers.Wallet.createRandom();
    const { message } = await service.createSiweChallenge(wallet.address);
    const signature = await wallet.signMessage(message);

    prisma.wallet.findUnique.mockResolvedValue(null);
    identity.createIdentity.mockResolvedValue({
      id: 'u1',
      did: 'd',
      email: null,
      name: null,
    });
    prisma.wallet.create.mockResolvedValue({});

    await service.verifySiweLogin(message, signature);
    await expect(service.verifySiweLogin(message, signature)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('(d) rejects when the nonce was issued for a different address', async () => {
    const issuer = ethers.Wallet.createRandom();
    const attacker = ethers.Wallet.createRandom();
    // Challenge bound to the issuer's address...
    const { message } = await service.createSiweChallenge(issuer.address);
    // ...but signed by a different wallet.
    const signature = await attacker.signMessage(message);

    await expect(service.verifySiweLogin(message, signature)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a malformed signature', async () => {
    await expect(
      service.verifySiweLogin('localhost ...\nNonce: abc', '0xdeadbeef'),
    ).rejects.toThrow(UnauthorizedException);
  });
});
