import { BadRequestException } from '@nestjs/common';
import { AdminClientsService } from '../admin-clients.service';
import { PrismaService } from '../../prisma/prisma.service';
import { assertPublicJwks, validateDcrClientKeys } from '../../oauth/dcr-jwks.util';

const PUBLIC_JWKS = { keys: [{ kty: 'RSA', n: 'abc', e: 'AQAB', use: 'sig', kid: 'k1' }] };
const PRIVATE_JWKS = { keys: [{ kty: 'RSA', n: 'abc', e: 'AQAB', d: 'secret', kid: 'k1' }] };

describe('assertPublicJwks', () => {
  it('accepts a public JWK Set', () => {
    expect(() => assertPublicJwks(PUBLIC_JWKS)).not.toThrow();
  });
  it('rejects a JWK with private material (d)', () => {
    expect(() => assertPublicJwks(PRIVATE_JWKS)).toThrow(/private key/);
  });
  it('rejects a symmetric oct key', () => {
    expect(() => assertPublicJwks({ keys: [{ kty: 'oct', k: 'x' }] })).toThrow(/private key/);
  });
  it('rejects an empty/malformed set', () => {
    expect(() => assertPublicJwks({ keys: [] })).toThrow(/non-empty/);
  });
});

describe('validateDcrClientKeys + private-jwks', () => {
  it('private_key_jwt with a private JWK is rejected', () => {
    expect(() => validateDcrClientKeys({ method: 'private_key_jwt', jwks: PRIVATE_JWKS, jwksUri: undefined }))
      .toThrow(/private key/);
  });
});

describe('AdminClientsService auth-method', () => {
  let prisma: { oAuthClient: { create: jest.Mock; update: jest.Mock } };
  let service: AdminClientsService;

  beforeEach(() => {
    prisma = {
      oAuthClient: {
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'c1', clientSecretHash: 'h', ...data })),
        update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'c1', clientSecretHash: 'h', clientId: 'x', ...data })),
      },
    };
    service = new AdminClientsService(prisma as unknown as PrismaService);
  });

  it('persists private_key_jwt + jwks and stays confidential', async () => {
    await service.createOAuthClient({
      name: 'PK', clientId: 'pk1', redirectUris: [],
      tokenEndpointAuthMethod: 'private_key_jwt', jwks: PUBLIC_JWKS,
    });
    const data = prisma.oAuthClient.create.mock.calls[0][0].data;
    expect(data.tokenEndpointAuthMethod).toBe('private_key_jwt');
    expect(data.isPublic).toBe(false);
    expect(data.jwks).toEqual(PUBLIC_JWKS);
  });

  it('marks a "none" client public', async () => {
    await service.createOAuthClient({
      name: 'SPA', clientId: 'spa1', redirectUris: ['https://a/cb'],
      tokenEndpointAuthMethod: 'none',
    });
    expect(prisma.oAuthClient.create.mock.calls[0][0].data.isPublic).toBe(true);
  });

  it('rejects an unknown auth method', async () => {
    await expect(service.createOAuthClient({
      name: 'X', clientId: 'x1', redirectUris: [], tokenEndpointAuthMethod: 'client_secret_basic',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects private_key_jwt with a private JWK on update', async () => {
    await expect(service.updateOAuthClient('x', {
      tokenEndpointAuthMethod: 'private_key_jwt', jwks: PRIVATE_JWKS,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('leaves auth columns untouched when no method given', async () => {
    await service.updateOAuthClient('x', { name: 'renamed' });
    const data = prisma.oAuthClient.update.mock.calls[0][0].data;
    expect(data.tokenEndpointAuthMethod).toBeUndefined();
    expect(data.name).toBe('renamed');
  });
});
