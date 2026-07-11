import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SAML, SamlConfig, Profile, ValidateInResponseTo } from '@node-saml/node-saml';
import { ResolvedSamlConnection } from './saml-connection.store';
import { NormalizedProfile } from '../federation/contracts/normalized-profile';
import { SettingsService } from '../../common/settings/settings.service';

/** Common SAML attribute OIDs/URIs we look at for a display name. */
const DISPLAY_NAME_ATTRS = [
  'displayName',
  'urn:oid:2.16.840.1.113730.3.1.241', // displayName
  'http://schemas.microsoft.com/identity/claims/displayname',
  'urn:oid:2.5.4.3', // cn
];

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
  constructor(
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  /** True when SAML SSO is turned on for this deployment. */
  isEnabled(): boolean {
    return this.settings.flag('SAML_ENABLED');
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

  /** SP-initiated: the IdP redirect URL for an AuthnRequest, carrying RelayState. */
  authorizeUrl(connection: ResolvedSamlConnection, relayState: string): Promise<string> {
    return this.buildSaml(connection).getAuthorizeUrlAsync(relayState, undefined, {});
  }

  /**
   * Validate a base64 SAMLResponse from the ACS POST binding. node-saml verifies
   * the XMLDSig signature against the connection's IdP cert, the audience, the
   * conditions window, and (when present) InResponseTo — throwing on any failure.
   * Returns the assertion profile.
   */
  async validate(connection: ResolvedSamlConnection, samlResponse: string): Promise<Profile> {
    const { profile } = await this.buildSaml(connection).validatePostResponseAsync({
      SAMLResponse: samlResponse,
    });
    if (!profile) {
      throw new UnauthorizedException('SAML response carried no assertion');
    }
    return profile;
  }

  /**
   * Map a validated SAML profile onto the federation NormalizedProfile so a SAML
   * login reuses the exact provisioning/linking path as social login. The email
   * is treated as verified: it's vouched for by the trusted enterprise IdP.
   */
  toNormalizedProfile(
    connection: ResolvedSamlConnection,
    profile: Profile,
  ): NormalizedProfile {
    return {
      provider: `saml:${connection.slug}`,
      subject: profile.nameID,
      email: this.pickEmail(profile),
      emailVerified: true,
      displayName: this.pickDisplayName(profile),
      avatarUrl: null,
      raw: { issuer: profile.issuer, nameIDFormat: profile.nameIDFormat },
    };
  }

  private pickEmail(profile: Profile): string | null {
    const candidate = profile.email ?? profile.mail;
    if (typeof candidate === 'string' && candidate.includes('@')) return candidate;
    if (typeof profile.nameID === 'string' && profile.nameID.includes('@')) {
      return profile.nameID;
    }
    return null;
  }

  private pickDisplayName(profile: Profile): string | null {
    for (const key of DISPLAY_NAME_ATTRS) {
      const value = profile[key];
      if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    }
    return null;
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
