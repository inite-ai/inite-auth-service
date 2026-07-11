import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuthClient } from '@prisma/client';
import { TokenExchangeInput } from './dto/token-exchange.input';
import { JwksService } from '../common/jwks.service';

/** RFC 8693 token-type identifiers we accept/issue for Token Exchange. */
const TOKEN_TYPE_ACCESS = 'urn:ietf:params:oauth:token-type:access_token';
const TOKEN_TYPE_JWT = 'urn:ietf:params:oauth:token-type:jwt';

export interface ClientCredentialsTokenInput {
  client: OAuthClient;
  requestedScope?: string;
  audience?: string;
  dpopJkt?: string;
  /** RFC 8705 §3.1 certificate thumbprint (base64url SHA-256 of the DER). */
  certThumbprint?: string;
}

@Injectable()
export class OAuthM2mService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly jwksService: JwksService,
  ) {}

  /**
   * Issue a machine-to-machine access token via the
   * client_credentials grant (RFC 6749 §4.4). No user identity is
   * involved — the token's `sub` claim is the client's `companyId`
   * (or its `clientId` when companyId is not set), so downstream
   * services like brain key data per-tenant.
   *
   * Scopes are filtered against the client's `allowedScopes`: a
   * client cannot request brain:admin if it wasn't provisioned for
   * it. An empty request defaults to ALL the client's allowed scopes
   * — common pattern for service-to-service callers who don't want
   * to repeat the full scope list per request.
   *
   * Audience is honoured if the client passed one; otherwise the
   * token has no aud claim (caller's loss — they'd be rejected by
   * any service that audience-validates).
   *
   * The token is JWT-signed by the same JWKS the rest of the service
   * uses. Refresh tokens are NOT issued — client_credentials is
   * stateless by RFC; the caller re-fetches when the access token
   * nears expiry (see @inite/auth/machineToken for the SDK helper).
   */
  async issueClientCredentialsToken(
    input: ClientCredentialsTokenInput,
  ): Promise<{
    accessToken: string;
    expiresIn: number;
    scope: string;
    audience: string;
    tokenType: 'Bearer' | 'DPoP';
  }> {
    const { client, requestedScope, audience, dpopJkt, certThumbprint } = input;
    const grantedScopes = this.resolveClientCredentialsScopes(
      client,
      requestedScope,
    );

    // Audience binding — when the client has an explicit
    // allowedAudiences list, any requested audience must be in it.
    // Empty allow-list falls back to the legacy behaviour of using
    // clientId as the audience.
    const effectiveAudience = this.resolveExchangeAudience(client, audience);

    const sub = client.companyId ?? client.clientId;
    // M2M tokens use a shorter TTL than user-flow tokens so a
    // deactivated machine client stops working within ≤5min — our
    // chosen revocation strategy in place of a real-time revocation
    // list. Override via JWT_M2M_ACCESS_TOKEN_EXPIRY.
    const accessTokenExpiry = this.configService.get<string>(
      'JWT_M2M_ACCESS_TOKEN_EXPIRY',
      '5m',
    );
    const issuer = this.configService.get<string>(
      'JWT_ISSUER',
      'http://localhost:3002',
    );

    const claims: Record<string, unknown> = {
      sub,
      client_id: client.clientId,
      scopes: grantedScopes,
      scope: grantedScopes.join(' '),
    };
    // Sender-constraint confirmation (RFC 7800 cnf). A client may present a
    // DPoP proof (RFC 9449 §6.1, jkt) and/or a client certificate (RFC 8705
    // §3.1, x5t#S256); resource servers verify whichever the token carries.
    const cnf: Record<string, string> = {};
    if (dpopJkt) cnf.jkt = dpopJkt;
    if (certThumbprint) cnf['x5t#S256'] = certThumbprint;
    if (Object.keys(cnf).length > 0) {
      claims.cnf = cnf;
    }

    const accessToken = this.jwtService.sign(claims, {
      expiresIn: accessTokenExpiry as JwtSignOptions['expiresIn'],
      audience: effectiveAudience,
      issuer,
    });

    const expiresIn = this.parseExpiryToSeconds(accessTokenExpiry);
    return {
      accessToken,
      expiresIn,
      scope: grantedScopes.join(' '),
      audience: effectiveAudience,
      tokenType: dpopJkt ? 'DPoP' : 'Bearer',
    };
  }

  /**
   * RFC 8693 Token Exchange. Exchanges a presented subject_token (one of our
   * own signed access tokens / JWTs) for a new access token scoped down to a
   * target resource, carrying an `act` claim that names the requesting client
   * as the party acting on behalf of the subject (agent on-behalf-of
   * delegation). Authority can only narrow: the issued scope is bounded by the
   * subject token's scope and the calling client's allowedScopes.
   */
  async exchangeToken(input: TokenExchangeInput): Promise<{
    accessToken: string;
    expiresIn: number;
    scope: string;
    issuedTokenType: string;
    tokenType: 'Bearer';
  }> {
    const { client } = input;
    const okType =
      input.subjectTokenType === TOKEN_TYPE_ACCESS ||
      input.subjectTokenType === TOKEN_TYPE_JWT;
    if (!okType) {
      throw new BadRequestException('Unsupported subject_token_type');
    }

    const subject = this.verifyExchangeToken(input.subjectToken);
    const subjectScopes = this.claimScopes(subject);
    const grantedScopes = this.resolveExchangeScopes(
      input.requestedScope,
      subjectScopes,
      client.allowedScopes ?? [],
    );
    const effectiveAudience = this.resolveExchangeAudience(
      client,
      input.resource ?? input.audience,
    );

    // Actor: the party acting on behalf of the subject. Defaults to the
    // calling client; a presented actor_token nests its sub (RFC 8693 §4.1).
    let act: Record<string, unknown> = { sub: client.clientId };
    if (input.actorToken) {
      const actorClaims = this.verifyExchangeToken(input.actorToken);
      act = { sub: actorClaims.sub, client_id: client.clientId };
    }

    const accessTokenExpiry = this.configService.get<string>(
      'JWT_M2M_ACCESS_TOKEN_EXPIRY',
      '5m',
    );
    const issuer = this.configService.get<string>(
      'JWT_ISSUER',
      'http://localhost:3002',
    );

    const accessToken = this.jwtService.sign(
      {
        sub: subject.sub,
        client_id: client.clientId,
        act,
        scopes: grantedScopes,
        scope: grantedScopes.join(' '),
      },
      { expiresIn: accessTokenExpiry as JwtSignOptions['expiresIn'], audience: effectiveAudience, issuer },
    );

    return {
      accessToken,
      expiresIn: this.parseExpiryToSeconds(accessTokenExpiry),
      scope: grantedScopes.join(' '),
      issuedTokenType: TOKEN_TYPE_ACCESS,
      tokenType: 'Bearer',
    };
  }

  /**
   * Resolve the granted scopes for a client_credentials grant: an empty
   * request defaults to ALL allowed scopes, otherwise every requested
   * scope must be in the client's allow-list.
   */
  private resolveClientCredentialsScopes(
    client: OAuthClient,
    requestedScope: string | undefined,
  ): string[] {
    const requested = (requestedScope ?? '').split(/\s+/).filter(Boolean);
    const allowed = client.allowedScopes ?? [];
    const grantedScopes =
      requested.length === 0
        ? allowed.slice()
        : requested.filter((s) => allowed.includes(s));

    if (requested.length > 0 && grantedScopes.length !== requested.length) {
      const denied = requested.filter((s) => !allowed.includes(s));
      throw new BadRequestException(
        `Scope(s) not allowed for this client: ${denied.join(', ')}`,
      );
    }

    if (grantedScopes.length === 0) {
      throw new BadRequestException(
        'No scopes available for this client_credentials grant',
      );
    }

    return grantedScopes;
  }

  private verifyExchangeToken(token: string): Record<string, unknown> {
    try {
      // kid-aware verify so a subject/actor token signed by any published
      // key still validates during a signing-key rotation overlap.
      if (this.jwksService.isRs256Enabled()) {
        return this.jwtService.verify(token, {
          publicKey: this.jwksService.verificationKeyForToken(token),
        });
      }
      return this.jwtService.verify(token);
    } catch {
      throw new BadRequestException(
        'subject_token or actor_token is invalid or expired',
      );
    }
  }

  private claimScopes(claims: Record<string, unknown>): string[] {
    if (Array.isArray(claims.scopes)) return claims.scopes as string[];
    if (typeof claims.scope === 'string') {
      return claims.scope.split(/\s+/).filter(Boolean);
    }
    return [];
  }

  /** Issued scope = requested ∩ subject authority ∩ client allow-list. */
  private resolveExchangeScopes(
    requested: string | undefined,
    subjectScopes: string[],
    clientAllowed: string[],
  ): string[] {
    let ceiling = subjectScopes;
    if (clientAllowed.length > 0) {
      ceiling = ceiling.filter((s) => clientAllowed.includes(s));
    }
    const req = (requested ?? '').split(/\s+/).filter(Boolean);
    if (req.length === 0) {
      if (ceiling.length === 0) {
        throw new BadRequestException('No scopes available for token exchange');
      }
      return ceiling;
    }
    const denied = req.filter((s) => !ceiling.includes(s));
    if (denied.length > 0) {
      throw new BadRequestException(
        `Requested scope exceeds the subject token: ${denied.join(', ')}`,
      );
    }
    return req;
  }

  private resolveExchangeAudience(
    client: OAuthClient,
    audience: string | undefined,
  ): string {
    const allowedAud = client.allowedAudiences ?? [];
    if (audience) {
      if (allowedAud.length > 0 && !allowedAud.includes(audience)) {
        throw new BadRequestException(
          `Audience "${audience}" is not allowed for this client`,
        );
      }
      return audience;
    }
    return allowedAud[0] ?? client.clientId;
  }

  /**
   * Translate the expressive JWT expiry string ('10m', '1h', '3600s')
   * into seconds for the OAuth token-response `expires_in` field.
   * RFC 6749 §5.1 requires this as a number.
   */
  private parseExpiryToSeconds(expiry: string): number {
    const m = /^(\d+)([smhd]?)$/.exec(expiry.trim());
    if (!m) return 600;
    // Group 1 (\d+) is mandatory in the matched regex, so it is present.
    const value = parseInt(m[1]!, 10);
    switch (m[2]) {
      case 's':
      case '':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return value;
    }
  }
}
