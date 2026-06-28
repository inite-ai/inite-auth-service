// jose is ESM-only — stub before imports trigger the chain.
jest.mock('jose', () => jest.requireActual('jose'));

import { Test, TestingModule } from '@nestjs/testing';
import * as jose from 'jose';
import { DpopService } from '../dpop.service';
import { RedisService } from '../../common/redis.service';
import { UnauthorizedException } from '@nestjs/common';

const URL_UNDER_TEST = 'https://auth.inite.ai/v1/oauth/token';

async function buildKey(alg: 'ES256' | 'EdDSA' = 'ES256') {
  const { publicKey, privateKey } = await jose.generateKeyPair(alg, {
    extractable: true,
  });
  const publicJwk = await jose.exportJWK(publicKey);
  return { publicKey, privateKey, publicJwk, alg };
}

async function signProof(opts: {
  privateKey: any;
  publicJwk: any;
  alg: string;
  htu?: string;
  htm?: string;
  iat?: number;
  jti?: string;
}): Promise<string> {
  return new jose.SignJWT({
    htu: opts.htu ?? URL_UNDER_TEST,
    htm: opts.htm ?? 'POST',
    iat: opts.iat,
    jti: opts.jti ?? `jti-${Math.random().toString(36).slice(2)}`,
  })
    .setProtectedHeader({
      alg: opts.alg,
      typ: 'dpop+jwt',
      jwk: opts.publicJwk,
    })
    .setIssuedAt(opts.iat ?? Math.floor(Date.now() / 1000))
    .sign(opts.privateKey);
}

describe('DpopService', () => {
  let svc: DpopService;
  let redis: any;

  beforeEach(async () => {
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DpopService,
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    svc = module.get<DpopService>(DpopService);
  });

  it('accepts a well-formed ES256 proof and returns the jkt', async () => {
    const k = await buildKey('ES256');
    const proof = await signProof({
      privateKey: k.privateKey,
      publicJwk: k.publicJwk,
      alg: k.alg,
    });
    const expectedJkt = await jose.calculateJwkThumbprint(k.publicJwk);

    const result = await svc.validate(proof, 'POST', URL_UNDER_TEST);
    expect(result.jkt).toBe(expectedJkt);
    expect(result.alg).toBe('ES256');
    expect(redis.set).toHaveBeenCalled();
  });

  it('accepts EdDSA proofs', async () => {
    const k = await buildKey('EdDSA');
    const proof = await signProof({
      privateKey: k.privateKey,
      publicJwk: k.publicJwk,
      alg: k.alg,
    });
    const result = await svc.validate(proof, 'POST', URL_UNDER_TEST);
    expect(result.alg).toBe('EdDSA');
  });

  it('rejects RS256 (alg not in allow-list)', async () => {
    const k = await buildKey('ES256');
    // Hand-craft a proof claiming RS256 — verification would fail
    // anyway, but the alg check trips first.
    const fauxProof = await new jose.SignJWT({
      htu: URL_UNDER_TEST,
      htm: 'POST',
      jti: 'x',
    })
      .setProtectedHeader({ alg: k.alg, typ: 'dpop+jwt', jwk: k.publicJwk })
      .setIssuedAt()
      .sign(k.privateKey);
    // Tamper alg header in the proof payload header
    const parts = fauxProof.split('.');
    const newHeader = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'dpop+jwt', jwk: k.publicJwk }),
    ).toString('base64url');
    const tampered = [newHeader, parts[1], parts[2]].join('.');

    await expect(
      svc.validate(tampered, 'POST', URL_UNDER_TEST),
    ).rejects.toThrow(/alg.*not allowed/);
  });

  it('rejects proofs with the wrong typ header', async () => {
    const k = await buildKey('ES256');
    const jwt = await new jose.SignJWT({ htu: URL_UNDER_TEST, htm: 'POST', jti: 'x' })
      .setProtectedHeader({ alg: 'ES256', typ: 'JWT', jwk: k.publicJwk })
      .setIssuedAt()
      .sign(k.privateKey);
    await expect(
      svc.validate(jwt, 'POST', URL_UNDER_TEST),
    ).rejects.toThrow(/typ must be dpop\+jwt/);
  });

  it('rejects proofs with a private-key jwk in the header', async () => {
    const k = await buildKey('ES256');
    const fauxJwk = { ...k.publicJwk, d: 'not-allowed' };
    const proof = await new jose.SignJWT({
      htu: URL_UNDER_TEST,
      htm: 'POST',
      jti: 'x',
    })
      .setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk: fauxJwk as any })
      .setIssuedAt()
      .sign(k.privateKey);
    await expect(
      svc.validate(proof, 'POST', URL_UNDER_TEST),
    ).rejects.toThrow(/must not contain private/);
  });

  it('rejects proofs with htm mismatch', async () => {
    const k = await buildKey('ES256');
    const proof = await signProof({
      privateKey: k.privateKey,
      publicJwk: k.publicJwk,
      alg: k.alg,
      htm: 'GET',
    });
    await expect(
      svc.validate(proof, 'POST', URL_UNDER_TEST),
    ).rejects.toThrow(/htm mismatch/);
  });

  it('rejects proofs with htu mismatch', async () => {
    const k = await buildKey('ES256');
    const proof = await signProof({
      privateKey: k.privateKey,
      publicJwk: k.publicJwk,
      alg: k.alg,
      htu: 'https://attacker.example.com/v1/oauth/token',
    });
    await expect(
      svc.validate(proof, 'POST', URL_UNDER_TEST),
    ).rejects.toThrow(/htu mismatch/);
  });

  it('rejects proofs older than the freshness window', async () => {
    const k = await buildKey('ES256');
    const proof = await signProof({
      privateKey: k.privateKey,
      publicJwk: k.publicJwk,
      alg: k.alg,
      iat: Math.floor(Date.now() / 1000) - 120, // 2 min old
    });
    await expect(
      svc.validate(proof, 'POST', URL_UNDER_TEST),
    ).rejects.toThrow(/iat outside freshness window/);
  });

  it('rejects replays — second use of the same jti fails', async () => {
    const k = await buildKey('ES256');
    const proof = await signProof({
      privateKey: k.privateKey,
      publicJwk: k.publicJwk,
      alg: k.alg,
      jti: 'fixed-jti-1',
    });

    await svc.validate(proof, 'POST', URL_UNDER_TEST);
    // Second call: Redis "remembers" the jti
    redis.get.mockResolvedValueOnce('1');
    await expect(
      svc.validate(proof, 'POST', URL_UNDER_TEST),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects proofs signed by a different key than the embedded jwk', async () => {
    const realKey = await buildKey('ES256');
    const attackerKey = await buildKey('ES256');
    // Sign with attackerKey but advertise realKey's public jwk
    const proof = await new jose.SignJWT({
      htu: URL_UNDER_TEST,
      htm: 'POST',
      jti: 'x',
    })
      .setProtectedHeader({
        alg: 'ES256',
        typ: 'dpop+jwt',
        jwk: realKey.publicJwk,
      })
      .setIssuedAt()
      .sign(attackerKey.privateKey);

    await expect(
      svc.validate(proof, 'POST', URL_UNDER_TEST),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('htu comparison ignores port omission on https', async () => {
    const k = await buildKey('ES256');
    const proof = await signProof({
      privateKey: k.privateKey,
      publicJwk: k.publicJwk,
      alg: k.alg,
      htu: 'https://auth.inite.ai:443/v1/oauth/token',
    });
    const r = await svc.validate(proof, 'POST', URL_UNDER_TEST);
    expect(r.jkt).toBeTruthy();
  });
});
