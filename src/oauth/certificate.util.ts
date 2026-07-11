import { createHash, X509Certificate } from 'node:crypto';

/**
 * Pure X.509 helpers for RFC 8705 mTLS — no DI so the parsing/thumbprint logic
 * is trivially unit-testable and shared between the auth service and any future
 * introspection/resource-server code.
 */

/**
 * Parse a reverse-proxy-forwarded client certificate header into an
 * X509Certificate. Tolerates the common shapes a TLS-terminating proxy emits:
 *   - a URL-encoded PEM (Traefik `passTLSClientCert`),
 *   - a raw PEM block, or
 *   - bare base64 DER with the PEM armor stripped.
 * Returns null when the value is absent or not a parseable certificate — the
 * caller decides whether a missing cert is an error for this client.
 */
export function parseForwardedCertificate(
  raw: string | undefined | null,
): X509Certificate | null {
  if (!raw) return null;
  let text = raw.trim();
  try {
    text = decodeURIComponent(text);
  } catch {
    // Value wasn't URL-encoded — use it verbatim.
  }
  text = text.trim();
  if (text.length === 0) return null;
  try {
    const pem = text.includes('BEGIN CERTIFICATE')
      ? text
      : `-----BEGIN CERTIFICATE-----\n${text.replace(/\s+/g, '')}\n-----END CERTIFICATE-----`;
    return new X509Certificate(pem);
  } catch {
    return null;
  }
}

/**
 * RFC 8705 §3.1 certificate thumbprint: the base64url-encoded SHA-256 of the
 * DER-encoded certificate, bound into the access token's `cnf["x5t#S256"]`.
 */
export function certificateThumbprint(cert: X509Certificate): string {
  return createHash('sha256').update(cert.raw).digest('base64url');
}

/**
 * Canonicalize an X.500 subject DN for equality comparison. Node renders the
 * subject as newline-separated RDNs; we split on newlines and commas, trim,
 * lowercase, and sort so ordering/whitespace/case differences between the
 * registered value and the presented certificate don't cause false mismatches.
 */
export function canonicalizeSubjectDn(dn: string): string {
  return dn
    .split(/[\n,]/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(',');
}
