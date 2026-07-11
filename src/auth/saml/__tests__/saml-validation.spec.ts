import { ConfigService } from '@nestjs/config';
import { SamlService } from '../saml.service';
import { ResolvedSamlConnection } from '../saml-connection.store';
import {
  SAML_IDP_CERT_PEM,
  SAML_RESPONSE_VALID,
  SAML_RESPONSE_WRAPPED,
  SAML_RESPONSE_UNSIGNED,
} from './saml-fixtures';
import { SELF_SIGNED_CERT_PEM } from '../../../oauth/__tests__/mtls-certs.fixture';
import { fakeSettings } from '../../../common/settings/settings.test-fixture';

/**
 * SAML assertion validation — the security core. The fixtures are a validly
 * IdP-signed SAMLResponse plus adversarial variants (signature-wrapping,
 * unsigned); the IdP signing key never left an ephemeral scratchpad.
 */
function serviceWith(env: Record<string, string>): SamlService {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new SamlService(config, fakeSettings(env));
}

const svc = serviceWith({ SAML_ENABLED: 'true', OIDC_ISSUER: 'https://auth.example.com' });

function connectionWithCert(idpCert: string): ResolvedSamlConnection {
  return {
    id: 'c1',
    companyId: 'co-1',
    slug: 'acme',
    displayName: 'Acme IdP',
    enabled: true,
    idpEntityId: 'https://idp.acme.test/entity',
    idpSsoUrl: 'https://idp.acme.test/sso',
    idpCert,
  };
}

const trusted = connectionWithCert(SAML_IDP_CERT_PEM);

describe('SamlService — assertion validation', () => {
  it('accepts a validly IdP-signed assertion', async () => {
    const profile = await svc.validate(trusted, SAML_RESPONSE_VALID);
    expect(profile.nameID).toBe('alice@acme.test');
  });

  it('maps the assertion to a NormalizedProfile (verified email, per-connection provider)', async () => {
    const profile = await svc.validate(trusted, SAML_RESPONSE_VALID);
    const normalized = svc.toNormalizedProfile(trusted, profile);
    expect(normalized).toMatchObject({
      provider: 'saml:acme',
      subject: 'alice@acme.test',
      email: 'alice@acme.test',
      emailVerified: true,
      displayName: 'Alice Acme',
    });
  });

  it('rejects a signature-wrapping (XSW) response', async () => {
    await expect(svc.validate(trusted, SAML_RESPONSE_WRAPPED)).rejects.toThrow();
  });

  it('rejects an unsigned assertion (wantAssertionsSigned)', async () => {
    await expect(svc.validate(trusted, SAML_RESPONSE_UNSIGNED)).rejects.toThrow();
  });

  it('rejects an assertion signed by an untrusted certificate', async () => {
    const untrusted = connectionWithCert(SELF_SIGNED_CERT_PEM);
    await expect(untrusted.idpCert).not.toBe(SAML_IDP_CERT_PEM);
    await expect(svc.validate(untrusted, SAML_RESPONSE_VALID)).rejects.toThrow();
  });

  it('rejects a malformed SAMLResponse', async () => {
    await expect(svc.validate(trusted, 'not-valid-base64-xml')).rejects.toThrow();
  });
});
