import { Injectable, UnauthorizedException } from '@nestjs/common';
import { X509Certificate } from 'node:crypto';
import * as jose from 'jose';
import { OAuthClient } from '@prisma/client';
import type { Request } from 'express';
import { SettingsService } from '../common/settings/settings.service';
import { OAuthClientRegistryService } from './oauth-client-registry.service';
import {
  parseForwardedCertificate,
  certificateThumbprint,
  canonicalizeSubjectDn,
} from './certificate.util';

/** RFC 8705 token_endpoint_auth_method values this service authenticates. */
export const TLS_CLIENT_AUTH = 'tls_client_auth';
export const SELF_SIGNED_TLS_CLIENT_AUTH = 'self_signed_tls_client_auth';

/** Default proxy header carrying the forwarded client certificate. */
const DEFAULT_CERT_HEADER = 'x-forwarded-tls-client-cert';

/**
 * RFC 8705 — mutual-TLS client authentication + certificate-bound access
 * tokens. Feature-gated by `MTLS_ENABLED`. Two client-auth modes:
 *   - `tls_client_auth` (PKI): the presented cert must chain to the trusted CA
 *     (`MTLS_TRUSTED_CA_CERT`) and its subject DN must match the value
 *     registered on the client (RFC 8705 §2.1).
 *   - `self_signed_tls_client_auth`: the cert's public key must match a key in
 *     the client's registered JWKS by RFC 7638 thumbprint (§2.2).
 * On the M2M token path the presented cert's `x5t#S256` thumbprint is bound
 * into `cnf` so resource servers can enforce sender-constraint (§3).
 *
 * TLS is terminated at the reverse proxy, which forwards the client
 * certificate in a trusted header (see `MTLS_CLIENT_CERT_HEADER`) exactly as
 * `X-Forwarded-For` is trusted today. The mTLS host is a separate router so
 * ordinary clients are never asked to present a certificate.
 */
@Injectable()
export class MtlsService {
  constructor(
    private readonly settings: SettingsService,
    private readonly registry: OAuthClientRegistryService,
  ) {}

  /** True when mTLS is turned on for this deployment. */
  isEnabled(): boolean {
    return this.settings.flag('MTLS_ENABLED');
  }

  /** True when the client authenticates via one of the mTLS methods. */
  usesMtls(client: OAuthClient): boolean {
    return (
      client.tokenEndpointAuthMethod === TLS_CLIENT_AUTH ||
      client.tokenEndpointAuthMethod === SELF_SIGNED_TLS_CLIENT_AUTH
    );
  }

  /** Read + parse the forwarded client certificate, or null when absent. */
  presentedCertificate(req: Request): X509Certificate | null {
    const header = this.settings
      .value('MTLS_CLIENT_CERT_HEADER', DEFAULT_CERT_HEADER)
      .toLowerCase();
    const raw = req.headers[header];
    return parseForwardedCertificate(Array.isArray(raw) ? raw[0] : raw);
  }

  /**
   * Authenticate a client by its presented certificate. Resolves the client by
   * `client_id`, then validates the cert against the client's configured mTLS
   * method. Throws Unauthorized on any mismatch. Only call when `isEnabled()`
   * and a certificate is present on the request.
   */
  async authenticate(
    clientId: string,
    cert: X509Certificate,
  ): Promise<OAuthClient> {
    const client = await this.registry.validateClient(clientId);
    if (client.tokenEndpointAuthMethod === TLS_CLIENT_AUTH) {
      this.assertPkiCertificate(client, cert);
    } else if (client.tokenEndpointAuthMethod === SELF_SIGNED_TLS_CLIENT_AUTH) {
      await this.assertSelfSignedCertificate(client, cert);
    } else {
      throw new UnauthorizedException(
        'client is not configured for mTLS authentication',
      );
    }
    return client;
  }

  /**
   * Certificate-bound token thumbprint for an mTLS client. Returns the RFC 8705
   * `x5t#S256` to place in `cnf`, or undefined when mTLS is off, the client
   * doesn't use mTLS, or no certificate is present.
   */
  resolveCertThumbprint(
    req: Request,
    client: OAuthClient,
  ): string | undefined {
    if (!this.isEnabled() || !this.usesMtls(client)) return undefined;
    const cert = this.presentedCertificate(req);
    return cert ? certificateThumbprint(cert) : undefined;
  }

  /** §2.1 PKI: chain to the trusted CA + subject DN must match the registration. */
  private assertPkiCertificate(client: OAuthClient, cert: X509Certificate): void {
    const caPem = this.settings.raw('MTLS_TRUSTED_CA_CERT');
    if (!caPem) {
      throw new UnauthorizedException('mTLS PKI validation is not configured');
    }
    let ca: X509Certificate;
    try {
      ca = new X509Certificate(caPem);
    } catch {
      throw new UnauthorizedException('MTLS_TRUSTED_CA_CERT is not a valid certificate');
    }
    if (!cert.checkIssued(ca) || !cert.verify(ca.publicKey)) {
      throw new UnauthorizedException(
        'client certificate is not issued by the trusted CA',
      );
    }
    const expected = client.tlsClientAuthSubjectDn;
    if (!expected) {
      throw new UnauthorizedException(
        'client has no registered certificate subject',
      );
    }
    if (canonicalizeSubjectDn(cert.subject) !== canonicalizeSubjectDn(expected)) {
      throw new UnauthorizedException('client certificate subject does not match');
    }
  }

  /** §2.2 self-signed: cert public-key thumbprint must be in the client JWKS. */
  private async assertSelfSignedCertificate(
    client: OAuthClient,
    cert: X509Certificate,
  ): Promise<void> {
    const registered = (client.jwks as { keys?: jose.JWK[] } | null)?.keys ?? [];
    if (registered.length === 0) {
      throw new UnauthorizedException(
        'client has no registered keys for self-signed mTLS',
      );
    }
    const certThumb = await jose.calculateJwkThumbprint(
      cert.publicKey.export({ format: 'jwk' }) as jose.JWK,
    );
    for (const key of registered) {
      try {
        if ((await jose.calculateJwkThumbprint(key)) === certThumb) return;
      } catch {
        // Skip a malformed registered key rather than fail the whole match.
      }
    }
    throw new UnauthorizedException(
      'client certificate key does not match a registered key',
    );
  }
}
