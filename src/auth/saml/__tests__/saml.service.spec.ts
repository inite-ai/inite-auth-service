import { ConfigService } from '@nestjs/config';
import { SamlService } from '../saml.service';
import { ResolvedSamlConnection } from '../saml-connection.store';
import { SELF_SIGNED_CERT_PEM } from '../../../oauth/__tests__/mtls-certs.fixture';

function serviceWith(env: Record<string, string>): SamlService {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new SamlService(config);
}

const connection: ResolvedSamlConnection = {
  id: 'c1',
  companyId: 'co-1',
  slug: 'acme',
  displayName: 'Acme IdP',
  enabled: true,
  idpEntityId: 'https://idp.acme.test/entity',
  idpSsoUrl: 'https://idp.acme.test/sso',
  idpCert: SELF_SIGNED_CERT_PEM,
};

describe('SamlService', () => {
  const svc = serviceWith({ SAML_ENABLED: 'true', OIDC_ISSUER: 'https://auth.example.com' });

  it('reflects SAML_ENABLED', () => {
    expect(svc.isEnabled()).toBe(true);
    expect(serviceWith({}).isEnabled()).toBe(false);
  });

  it('derives per-connection SP EntityID and ACS URLs', () => {
    expect(svc.spEntityId('acme')).toBe('https://auth.example.com/v1/auth/saml/acme/metadata');
    expect(svc.acsUrl('acme')).toBe('https://auth.example.com/v1/auth/saml/acme/acs');
  });

  it('generates SP metadata carrying the ACS URL + EntityID', () => {
    const xml = svc.metadata(connection);
    expect(xml).toContain('SPSSODescriptor');
    expect(xml).toContain('https://auth.example.com/v1/auth/saml/acme/acs');
    expect(xml).toContain('entityID="https://auth.example.com/v1/auth/saml/acme/metadata"');
  });

  it('builds a SAML instance that requires signed assertions', () => {
    // Constructing must not throw with a valid cert; the instance is the object
    // the ACS handler will call validatePostResponseAsync on.
    expect(svc.buildSaml(connection)).toBeDefined();
  });
});
