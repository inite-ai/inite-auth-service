import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SAML, SamlConfig, ValidateInResponseTo } from '@node-saml/node-saml';
import { ResolvedSamlConnection } from './saml-connection.store';

/**
 * SAML 2.0 Service Provider — wraps @node-saml/node-saml (which owns the XML
 * canonicalization + XMLDSig verification + replay/InResponseTo/audience checks
 * that are the classic hand-rolled-SAML footguns). Feature-gated by SAML_ENABLED.
 *
 * Security baseline: `wantAssertionsSigned` is always true and the IdP `Issuer`
 * is pinned to the connection's registered EntityID, so an inbound assertion is
 * only trusted when signed by that specific IdP's certificate. SP request
 * signing + assertion encryption are deliberately out of scope for v1 — the IdP
 * signature on the assertion is the trust boundary.
 */
@Injectable()
export class SamlService {
  constructor(private readonly config: ConfigService) {}

  /** True when SAML SSO is turned on for this deployment. */
  isEnabled(): boolean {
    return this.config.get<string>('SAML_ENABLED') === 'true';
  }

  /** Per-connection SP EntityID (also the metadata URL). */
  spEntityId(slug: string): string {
    return `${this.baseUrl()}/v1/auth/saml/${slug}/metadata`;
  }

  /** Per-connection Assertion Consumer Service URL. */
  acsUrl(slug: string): string {
    return `${this.baseUrl()}/v1/auth/saml/${slug}/acs`;
  }

  /** Build a configured SAML instance for a connection. */
  buildSaml(connection: ResolvedSamlConnection): SAML {
    return new SAML(this.buildConfig(connection));
  }

  /** SP metadata XML (EntityDescriptor / SPSSODescriptor) for a connection. */
  metadata(connection: ResolvedSamlConnection): string {
    return this.buildSaml(connection).generateServiceProviderMetadata(null, null);
  }

  private buildConfig(connection: ResolvedSamlConnection): SamlConfig {
    return {
      // Trust anchor: assertions must be signed by this IdP cert…
      idpCert: connection.idpCert,
      // …and carry this exact Issuer.
      idpIssuer: connection.idpEntityId,
      issuer: this.spEntityId(connection.slug),
      callbackUrl: this.acsUrl(connection.slug),
      entryPoint: connection.idpSsoUrl,
      audience: this.spEntityId(connection.slug),
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: false,
      acceptedClockSkewMs: 60_000,
      validateInResponseTo: ValidateInResponseTo.ifPresent,
      signatureAlgorithm: 'sha256',
      digestAlgorithm: 'sha256',
      // Accept whatever NameID format the IdP is configured to release.
      identifierFormat: null,
      disableRequestedAuthnContext: true,
    };
  }

  private baseUrl(): string {
    return (
      this.config.get<string>('OIDC_ISSUER') ??
      this.config.get<string>('JWT_ISSUER') ??
      'http://localhost:3002'
    );
  }
}
