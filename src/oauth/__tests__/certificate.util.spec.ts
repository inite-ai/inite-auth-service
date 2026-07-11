import { X509Certificate } from 'node:crypto';
import {
  parseForwardedCertificate,
  certificateThumbprint,
  canonicalizeSubjectDn,
} from '../certificate.util';
import { LEAF_CERT_PEM } from './mtls-certs.fixture';

const leafPem = LEAF_CERT_PEM;

/**
 * The leaf fixture's expected RFC 8705 §3.1 thumbprint, produced out-of-band:
 *   openssl x509 -in leaf-cert.pem -outform der \
 *     | openssl dgst -sha256 -binary | openssl base64 | tr '+/' '-_' | tr -d '='
 */
const LEAF_X5T_S256 = 'CP_y9RF45W7h0ryE48c5bJhVyG7sClgE3PONdzV6t3o';

describe('certificate.util', () => {
  describe('parseForwardedCertificate', () => {
    it('parses a raw PEM block', () => {
      const cert = parseForwardedCertificate(leafPem);
      expect(cert).toBeInstanceOf(X509Certificate);
    });

    it('parses a URL-encoded PEM (Traefik passTLSClientCert)', () => {
      const cert = parseForwardedCertificate(encodeURIComponent(leafPem));
      expect(cert?.subject).toContain('mtls-client.inite.ai');
    });

    it('parses bare base64 DER with the armor stripped', () => {
      const der = new X509Certificate(leafPem).raw.toString('base64');
      const cert = parseForwardedCertificate(der);
      expect(cert).toBeInstanceOf(X509Certificate);
    });

    it('returns null for absent or unparsable input', () => {
      expect(parseForwardedCertificate(undefined)).toBeNull();
      expect(parseForwardedCertificate('')).toBeNull();
      expect(parseForwardedCertificate('not-a-certificate')).toBeNull();
    });
  });

  it('computes the RFC 8705 x5t#S256 thumbprint', () => {
    const cert = new X509Certificate(leafPem);
    expect(certificateThumbprint(cert)).toBe(LEAF_X5T_S256);
  });

  describe('canonicalizeSubjectDn', () => {
    it('is order-, case-, and whitespace-insensitive', () => {
      const a = canonicalizeSubjectDn('C=US\nO=INITE\nCN=mtls-client.inite.ai');
      const b = canonicalizeSubjectDn('CN=mtls-client.inite.ai,  O=inite , c=us');
      expect(a).toBe(b);
    });

    it('distinguishes genuinely different subjects', () => {
      expect(canonicalizeSubjectDn('CN=a')).not.toBe(canonicalizeSubjectDn('CN=b'));
    });
  });
});
