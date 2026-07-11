import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { X509Certificate } from 'node:crypto';
import * as jose from 'jose';
import { ConfigService } from '@nestjs/config';
import { OAuthClient } from '@prisma/client';
import type { Request } from 'express';
import { MtlsService } from '../mtls.service';
import { OAuthClientRegistryService } from '../oauth-client-registry.service';

/**
 * RFC 8705 mTLS. Fixtures are PUBLIC test certificates only (no private keys):
 *   CA + a leaf it signed (PKI / tls_client_auth) and a self-signed leaf
 *   (self_signed_tls_client_auth). Regenerate with:
 *     openssl ecparam -name prime256v1 -genkey -noout -out ca.key
 *     openssl req -new -x509 -key ca.key -days 3650 \
 *       -subj "/C=US/O=INITE Test CA/CN=INITE Test Root" -out ca-cert.pem
 *     openssl ecparam -name prime256v1 -genkey -noout -out leaf.key
 *     openssl req -new -key leaf.key -subj "/C=US/O=INITE/CN=mtls-client.inite.ai" -out leaf.csr
 *     openssl x509 -req -in leaf.csr -CA ca-cert.pem -CAkey ca.key \
 *       -CAcreateserial -days 1825 -out leaf-cert.pem
 */
const FIXTURES = join(__dirname, 'fixtures', 'mtls');
const caPem = readFileSync(join(FIXTURES, 'ca-cert.pem'), 'utf8');
const leafPem = readFileSync(join(FIXTURES, 'leaf-cert.pem'), 'utf8');
const selfSignedPem = readFileSync(join(FIXTURES, 'selfsigned-cert.pem'), 'utf8');

const LEAF_SUBJECT = 'CN=mtls-client.inite.ai, O=INITE, C=US';

function reqWithCert(pem: string | undefined): Request {
  return {
    headers: pem ? { 'x-forwarded-tls-client-cert': encodeURIComponent(pem) } : {},
  } as unknown as Request;
}

function makeService(
  env: Record<string, string>,
  client: Partial<OAuthClient>,
): { svc: MtlsService; validateClient: jest.Mock } {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  const validateClient = jest.fn().mockResolvedValue(client as OAuthClient);
  const registry = { validateClient } as unknown as OAuthClientRegistryService;
  return { svc: new MtlsService(config, registry), validateClient };
}

async function selfSignedJwks(): Promise<{ keys: jose.JWK[] }> {
  const jwk = new X509Certificate(selfSignedPem).publicKey.export({
    format: 'jwk',
  }) as jose.JWK;
  return { keys: [jwk] };
}

describe('MtlsService', () => {
  it('isEnabled reflects MTLS_ENABLED', () => {
    expect(makeService({ MTLS_ENABLED: 'true' }, {}).svc.isEnabled()).toBe(true);
    expect(makeService({}, {}).svc.isEnabled()).toBe(false);
  });

  it('usesMtls detects the two RFC 8705 methods', () => {
    const { svc } = makeService({}, {});
    expect(svc.usesMtls({ tokenEndpointAuthMethod: 'tls_client_auth' } as OAuthClient)).toBe(true);
    expect(
      svc.usesMtls({ tokenEndpointAuthMethod: 'self_signed_tls_client_auth' } as OAuthClient),
    ).toBe(true);
    expect(svc.usesMtls({ tokenEndpointAuthMethod: 'client_secret_post' } as OAuthClient)).toBe(false);
  });

  it('reads the forwarded certificate from the configured header', () => {
    const { svc } = makeService({ MTLS_CLIENT_CERT_HEADER: 'x-ssl-client-cert' }, {});
    const req = { headers: { 'x-ssl-client-cert': encodeURIComponent(leafPem) } } as unknown as Request;
    expect(svc.presentedCertificate(req)?.subject).toContain('mtls-client.inite.ai');
  });

  describe('tls_client_auth (PKI)', () => {
    const client = {
      clientId: 'c-pki',
      tokenEndpointAuthMethod: 'tls_client_auth',
      tlsClientAuthSubjectDn: LEAF_SUBJECT,
    } as OAuthClient;

    it('authenticates a cert that chains to the CA and matches the subject', async () => {
      const { svc } = makeService({ MTLS_TRUSTED_CA_CERT: caPem }, client);
      const result = await svc.authenticate('c-pki', new X509Certificate(leafPem));
      expect(result.clientId).toBe('c-pki');
    });

    it('rejects a self-signed cert not issued by the trusted CA', async () => {
      const { svc } = makeService({ MTLS_TRUSTED_CA_CERT: caPem }, client);
      await expect(
        svc.authenticate('c-pki', new X509Certificate(selfSignedPem)),
      ).rejects.toThrow(/trusted CA/);
    });

    it('rejects when the subject DN does not match', async () => {
      const mismatched = { ...client, tlsClientAuthSubjectDn: 'CN=someone-else' } as OAuthClient;
      const { svc } = makeService({ MTLS_TRUSTED_CA_CERT: caPem }, mismatched);
      await expect(
        svc.authenticate('c-pki', new X509Certificate(leafPem)),
      ).rejects.toThrow(/subject does not match/);
    });

    it('rejects when no trusted CA is configured', async () => {
      const { svc } = makeService({}, client);
      await expect(
        svc.authenticate('c-pki', new X509Certificate(leafPem)),
      ).rejects.toThrow(/not configured/);
    });
  });

  describe('self_signed_tls_client_auth', () => {
    it('authenticates a cert whose key is in the client JWKS', async () => {
      const client = {
        clientId: 'c-ss',
        tokenEndpointAuthMethod: 'self_signed_tls_client_auth',
        jwks: await selfSignedJwks(),
      } as unknown as OAuthClient;
      const { svc } = makeService({}, client);
      const result = await svc.authenticate('c-ss', new X509Certificate(selfSignedPem));
      expect(result.clientId).toBe('c-ss');
    });

    it('rejects a cert whose key is not registered', async () => {
      const client = {
        clientId: 'c-ss',
        tokenEndpointAuthMethod: 'self_signed_tls_client_auth',
        jwks: await selfSignedJwks(),
      } as unknown as OAuthClient;
      const { svc } = makeService({}, client);
      await expect(
        svc.authenticate('c-ss', new X509Certificate(leafPem)),
      ).rejects.toThrow(/does not match a registered key/);
    });

    it('rejects when the client has no registered keys', async () => {
      const client = {
        clientId: 'c-ss',
        tokenEndpointAuthMethod: 'self_signed_tls_client_auth',
        jwks: null,
      } as OAuthClient;
      const { svc } = makeService({}, client);
      await expect(
        svc.authenticate('c-ss', new X509Certificate(selfSignedPem)),
      ).rejects.toThrow(/no registered keys/);
    });
  });

  it('rejects a client not provisioned for any mTLS method', async () => {
    const client = { clientId: 'c', tokenEndpointAuthMethod: 'client_secret_post' } as OAuthClient;
    const { svc } = makeService({}, client);
    await expect(
      svc.authenticate('c', new X509Certificate(leafPem)),
    ).rejects.toThrow(/not configured for mTLS/);
  });

  describe('resolveCertThumbprint', () => {
    const mtlsClient = { tokenEndpointAuthMethod: 'tls_client_auth' } as OAuthClient;

    it('returns the x5t#S256 for an mTLS client presenting a cert', () => {
      const { svc } = makeService({ MTLS_ENABLED: 'true' }, {});
      expect(svc.resolveCertThumbprint(reqWithCert(leafPem), mtlsClient)).toBe(
        'CP_y9RF45W7h0ryE48c5bJhVyG7sClgE3PONdzV6t3o',
      );
    });

    it('returns undefined when mTLS is disabled', () => {
      const { svc } = makeService({}, {});
      expect(svc.resolveCertThumbprint(reqWithCert(leafPem), mtlsClient)).toBeUndefined();
    });

    it('returns undefined for a non-mTLS client', () => {
      const { svc } = makeService({ MTLS_ENABLED: 'true' }, {});
      const secretClient = { tokenEndpointAuthMethod: 'client_secret_post' } as OAuthClient;
      expect(svc.resolveCertThumbprint(reqWithCert(leafPem), secretClient)).toBeUndefined();
    });

    it('returns undefined when no certificate is present', () => {
      const { svc } = makeService({ MTLS_ENABLED: 'true' }, {});
      expect(svc.resolveCertThumbprint(reqWithCert(undefined), mtlsClient)).toBeUndefined();
    });
  });
});
