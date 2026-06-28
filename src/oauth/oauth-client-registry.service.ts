import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { OAuthClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterClientDto } from './dto/register-client.dto';

// Grants an open (unauthenticated) RFC 7591 registration may request.
// Deliberately EXCLUDES token-exchange and device_code — those are
// privilege-escalating and must be provisioned by an operator.
const DCR_ALLOWED_GRANTS = [
  'authorization_code',
  'refresh_token',
  'client_credentials',
];
const DCR_DEFAULT_GRANTS = ['authorization_code', 'refresh_token'];
const DCR_SUPPORTED_SCOPES = ['openid', 'profile', 'email', 'offline_access'];
const DCR_DEFAULT_SCOPES = ['openid', 'profile', 'email'];
const DCR_MAX_REDIRECT_URIS = 10;

/**
 * Pre-computed bcrypt hash of a static random string. Used as a
 * timing-equaliser target when validateClient finds no client row —
 * we still pay one bcrypt.compare so the no-client path takes the
 * same wall time as the wrong-secret path. Stops timing-channel
 * enumeration of valid client_ids.
 */
const TIMING_DUMMY_HASH =
  '$2a$10$CwTycUXWue0Thq9StjUM0u..wfBpO5SQEihKK5xrxAGl0F3PaMtsm';

/** RFC 8252 §7.3 — loopback hosts for native/CLI app redirects. */
function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1' || hostname === 'localhost';
}

@Injectable()
export class OAuthClientRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validate OAuth client (no secret required — for authorize endpoint)
   */
  async validateClient(clientId: string): Promise<OAuthClient>;
  /**
   * Validate OAuth client with secret (required — for token endpoint)
   */
  async validateClient(clientId: string, clientSecret: string): Promise<OAuthClient>;
  async validateClient(
    clientId: string,
    clientSecret?: string,
  ): Promise<OAuthClient> {
    const client = await this.prisma.oAuthClient.findFirst({
      where: { clientId, active: true },
    });

    if (!client) {
      // Pay one bcrypt round even on the no-client path so an
      // attacker can't distinguish "client unknown" from "wrong
      // secret" via response timing. Use a fixed dummy hash so the
      // CPU cost is constant regardless of input.
      if (clientSecret) {
        await bcrypt.compare(clientSecret, TIMING_DUMMY_HASH);
      }
      throw new UnauthorizedException('Invalid client');
    }

    if (clientSecret) {
      const matchesCurrent = await bcrypt.compare(
        clientSecret,
        client.clientSecretHash,
      );

      // Grace-period acceptance: during a rotation window, the prior
      // secret is still honoured until previousSecretExpiresAt. Run
      // the compare unconditionally when the column is present so an
      // attacker can't time-distinguish "current matched" from
      // "previous matched".
      let matchesPrevious = false;
      const previousHash = client.previousSecretHash;
      const previousExp = client.previousSecretExpiresAt;
      if (previousHash && previousExp && previousExp > new Date()) {
        matchesPrevious = await bcrypt.compare(clientSecret, previousHash);
      } else if (previousHash) {
        // Expired but still in column — pay the bcrypt cost to keep
        // timing constant, then ignore the result.
        await bcrypt.compare(clientSecret, previousHash);
      }

      if (!matchesCurrent && !matchesPrevious) {
        throw new UnauthorizedException('Invalid client credentials');
      }
    }

    return client;
  }

  /**
   * Validate OAuth client at the token endpoint.
   *
   * Confidential clients (`isPublic=false`) must present a matching
   * `client_secret`. Public clients (`isPublic=true`, e.g. CLIs and
   * native apps) skip the secret — their authentication is bound to
   * the grant: PKCE for authorization_code, the device_code itself
   * for the device flow. Per RFC 6749 §2.1 + RFC 7636.
   *
   * The grant-specific branches in the controller still enforce their
   * own checks (code_verifier must match the original challenge, the
   * device_code must be approved, etc.) so dropping the secret here
   * doesn't loosen the overall guarantees.
   */
  async validateClientWithSecret(
    clientId: string,
    clientSecret: string,
  ): Promise<OAuthClient> {
    if (!clientSecret) {
      const client = await this.validateClient(clientId);
      if (!client.isPublic) {
        throw new UnauthorizedException('client_secret is required');
      }
      return client;
    }
    return this.validateClient(clientId, clientSecret);
  }

  /**
   * Validate that the client supports the requested grant type
   */
  validateGrantType(client: OAuthClient, grantType: string): void {
    if (!client.allowedGrants || !client.allowedGrants.includes(grantType)) {
      throw new BadRequestException(
        `Grant type "${grantType}" is not allowed for this client`,
      );
    }
  }

  /**
   * Get public client info (for consent page)
   */
  async getClientInfo(clientId: string): Promise<{
    clientId: string;
    name: string;
    logoUrl?: string;
    privacyPolicyUrl?: string;
    termsOfServiceUrl?: string;
  }> {
    const client = await this.validateClient(clientId);
    return {
      clientId: client.clientId,
      name: client.name,
      logoUrl: client.logoUrl,
      privacyPolicyUrl: client.privacyPolicyUrl,
      termsOfServiceUrl: client.termsOfServiceUrl,
    };
  }

  /**
   * Validate redirect URI.
   *
   * Standard rule: exact match against the client's registered list.
   * RFC 8252 §7.3 exception: when both the requested URI and *some*
   * registered URI use a loopback hostname (`127.0.0.1`, `[::1]`,
   * `localhost`), the port is ignored at match time because native /
   * CLI apps bind a random ephemeral port at runtime.
   */
  validateRedirectUri(client: OAuthClient, redirectUri: string): boolean {
    if (client.redirectUris.includes(redirectUri)) return true;

    let requested: URL;
    try {
      requested = new URL(redirectUri);
    } catch {
      return false;
    }
    if (!isLoopbackHost(requested.hostname)) return false;

    return client.redirectUris.some((registered) => {
      try {
        const r = new URL(registered);
        return (
          isLoopbackHost(r.hostname) &&
          r.hostname === requested.hostname &&
          r.protocol === requested.protocol &&
          r.pathname === requested.pathname
        );
      } catch {
        return false;
      }
    });
  }

  /**
   * Register OAuth client
   */
  // eslint-disable-next-line max-params -- TODO(par-max): pass an options object / contract
  async registerClient(
    clientId: string,
    clientSecret: string,
    name: string,
    redirectUris: string[],
    allowedScopes: string[] = ['openid', 'profile', 'email'],
  ): Promise<OAuthClient> {
    const clientSecretHash = await bcrypt.hash(clientSecret, 10);

    return await this.prisma.oAuthClient.create({
      data: {
        clientId,
        clientSecretHash,
        name,
        redirectUris,
        allowedScopes,
        allowedGrants: ['authorization_code', 'refresh_token'],
        active: true,
      },
    });
  }

  /**
   * RFC 7591 Dynamic Client Registration (open, unauthenticated).
   * Security boundary: grants/scopes are intersected against hard
   * allow-lists, public clients never receive a secret, redirect_uris
   * are required for authorization_code and capped. Returns the row
   * plus the plaintext secret (null for public) for one-time display.
   */
  async registerDynamicClient(
    meta: RegisterClientDto,
  ): Promise<{ client: OAuthClient; clientSecret: string | null }> {
    const isPublic = meta.token_endpoint_auth_method === 'none';
    const allowedGrants = this.sanitizeGrants(meta.grant_types, isPublic);
    const allowedScopes = this.sanitizeScopes(meta.scope);
    const redirectUris = this.sanitizeRedirectUris(meta.redirect_uris, allowedGrants);
    const clientId = 'dcr_' + crypto.randomBytes(16).toString('hex');
    const { clientSecret, clientSecretHash } = await this.buildSecret(isPublic);
    const client = await this.prisma.oAuthClient.create({
      data: {
        clientId,
        clientSecretHash,
        name: meta.client_name || 'Dynamically Registered Client',
        redirectUris,
        allowedScopes,
        allowedGrants,
        isPublic,
        active: true,
        logoUrl: meta.logo_uri ?? null,
        privacyPolicyUrl: meta.policy_uri ?? null,
        termsOfServiceUrl: meta.tos_uri ?? null,
      },
    });
    return { client, clientSecret };
  }

  private sanitizeGrants(requested: string[] | undefined, isPublic: boolean): string[] {
    const valid = (requested ?? []).filter((g) => DCR_ALLOWED_GRANTS.includes(g));
    const grants = valid.length > 0 ? [...new Set(valid)] : [...DCR_DEFAULT_GRANTS];
    if (grants.includes('client_credentials') && isPublic) {
      throw new BadRequestException('confidential client required for client_credentials');
    }
    return grants;
  }

  private sanitizeScopes(scope: string | undefined): string[] {
    const requested = (scope ?? '').split(/\s+/).filter(Boolean);
    const valid = [...new Set(requested.filter((s) => DCR_SUPPORTED_SCOPES.includes(s)))];
    return valid.length > 0 ? valid : [...DCR_DEFAULT_SCOPES];
  }

  private sanitizeRedirectUris(uris: string[] | undefined, grants: string[]): string[] {
    const list = uris ?? [];
    if (grants.includes('authorization_code') && list.length === 0) {
      throw new BadRequestException('redirect_uris is required for the authorization_code grant');
    }
    if (list.length > DCR_MAX_REDIRECT_URIS) {
      throw new BadRequestException(`redirect_uris cannot exceed ${DCR_MAX_REDIRECT_URIS} entries`);
    }
    return list;
  }

  // Public clients store a random unusable hash (column never empty) but
  // discard the plaintext — they authenticate via PKCE, not a secret.
  private async buildSecret(
    isPublic: boolean,
  ): Promise<{ clientSecret: string | null; clientSecretHash: string }> {
    const raw = crypto.randomBytes(32).toString('base64url');
    const clientSecretHash = await bcrypt.hash(raw, 10);
    return { clientSecret: isPublic ? null : raw, clientSecretHash };
  }
}
