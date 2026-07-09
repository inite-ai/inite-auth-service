import { Injectable, BadRequestException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { validateDcrClientKeys } from "../oauth/dcr-jwks.util";
import { stripClientSecret } from "../common/sanitize";

const AUTH_METHODS = ['client_secret_post', 'private_key_jwt', 'none'];

/** Input shape for the token-endpoint auth method + key material. */
export interface ClientAuthMethodInput {
  tokenEndpointAuthMethod?: string;
  jwks?: unknown;
  jwksUri?: string | null;
}

/**
 * OAuth-client lifecycle management (list / read / create / update / rotate /
 * delete), split out of AdminService to keep both within the size gate.
 */
@Injectable()
export class AdminClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllOAuthClients() {
    const clients = await this.prisma.oAuthClient.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return clients.map(stripClientSecret);
  }

  async getOAuthClientById(clientId: string) {
    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId },
    });

    if (!client) return null;

    const [totalCodes, totalTokens, activeTokens] = await Promise.all([
      this.prisma.authorizationCode.count({ where: { clientId } }),
      this.prisma.refreshToken.count({ where: { clientId } }),
      this.prisma.refreshToken.count({ where: { clientId, revoked: false } }),
    ]);

    return {
      ...stripClientSecret(client),
      stats: {
        totalAuthCodes: totalCodes,
        totalTokens,
        activeTokens,
      },
    };
  }

  /**
   * Resolve + validate the token-endpoint auth method into Prisma fields.
   * Returns {} when no method is supplied so callers leave the columns
   * untouched. `private_key_jwt` requires public jwks/jwks_uri (validated),
   * `none` marks the client public.
   */
  private authMethodFields(input: ClientAuthMethodInput): Prisma.OAuthClientUncheckedCreateInput | Record<string, never> {
    const method = input.tokenEndpointAuthMethod;
    if (!method) return {};
    if (!AUTH_METHODS.includes(method)) {
      throw new BadRequestException(`Unsupported token_endpoint_auth_method: ${method}`);
    }
    validateDcrClientKeys({ method, jwks: input.jwks, jwksUri: input.jwksUri ?? undefined });
    return {
      tokenEndpointAuthMethod: method,
      isPublic: method === 'none',
      jwks: input.jwks != null ? (input.jwks as Prisma.InputJsonValue) : Prisma.JsonNull,
      jwksUri: input.jwksUri ?? null,
    } as Prisma.OAuthClientUncheckedCreateInput;
  }

  async createOAuthClient(data: {
    name: string;
    clientId: string;
    redirectUris: string[];
    allowedScopes?: string[];
    allowedGrants?: string[];
    companyId?: string | null;
    allowedAudiences?: string[];
    backchannelLogoutUri?: string | null;
  } & ClientAuthMethodInput) {
    const clientSecret = crypto.randomBytes(32).toString('base64url');
    const clientSecretHash = await bcrypt.hash(clientSecret, 10);

    const client = await this.prisma.oAuthClient.create({
      data: {
        clientId: data.clientId,
        name: data.name,
        redirectUris: data.redirectUris,
        clientSecretHash,
        allowedScopes: data.allowedScopes ?? ['openid', 'profile', 'email'],
        // Prisma uses the schema default when the field is omitted, so we
        // only set allowedGrants explicitly when the operator picked one.
        ...(data.allowedGrants && data.allowedGrants.length > 0
          ? { allowedGrants: data.allowedGrants }
          : {}),
        allowedAudiences: data.allowedAudiences ?? [],
        companyId: data.companyId ?? null,
        backchannelLogoutUri: data.backchannelLogoutUri ?? null,
        ...this.authMethodFields(data),
      },
    });

    return {
      ...stripClientSecret(client),
      clientSecret,
      message: 'Save this client secret - it will not be shown again!',
    };
  }

  async updateOAuthClient(
    clientId: string,
    data: Partial<{
      name: string;
      redirectUris: string[];
      allowedScopes: string[];
      allowedGrants: string[];
      companyId: string | null;
      allowedAudiences: string[];
      active: boolean;
      logoUrl: string;
      privacyPolicyUrl: string;
      termsOfServiceUrl: string;
      backchannelLogoutUri: string | null;
    }> & ClientAuthMethodInput,
  ) {
    // Separate the auth-method inputs (validated + mapped) from the plain
    // column updates so the raw jwks/method values aren't written unchecked.
    const { tokenEndpointAuthMethod, jwks, jwksUri, ...rest } = data;
    const authFields = this.authMethodFields({ tokenEndpointAuthMethod, jwks, jwksUri });
    try {
      const client = await this.prisma.oAuthClient.update({
        where: { clientId },
        data: { ...rest, ...authFields },
      });
      return stripClientSecret(client);
    } catch {
      return null;
    }
  }

  /**
   * Rotate a client secret with an optional grace window.
   *
   * Default behaviour: previous secret stays valid for 24h after
   * rotation so deployed callers can roll forward without an outage.
   * Pass `force: true` to revoke the old secret immediately — used
   * when the old value is known to be compromised.
   *
   * Grace window is capped at 7 days. Anything longer should be
   * handled by issuing a brand-new client instead, so the audit
   * trail stays clean.
   */
  async rotateClientSecret(
    clientId: string,
    opts: { graceWindowSeconds?: number; force?: boolean } = {},
  ) {
    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId },
    });

    if (!client) return null;

    const newSecret = crypto.randomBytes(32).toString('base64url');
    const newSecretHash = await bcrypt.hash(newSecret, 10);

    const maxGraceSeconds = 7 * 24 * 60 * 60;
    const requested = opts.graceWindowSeconds ?? 24 * 60 * 60;
    const graceSeconds = Math.min(Math.max(requested, 0), maxGraceSeconds);

    const data: Prisma.OAuthClientUpdateInput = {
      clientSecretHash: newSecretHash,
    };
    if (opts.force || graceSeconds === 0) {
      data.previousSecretHash = null;
      data.previousSecretExpiresAt = null;
    } else {
      data.previousSecretHash = client.clientSecretHash;
      data.previousSecretExpiresAt = new Date(Date.now() + graceSeconds * 1000);
    }

    await this.prisma.oAuthClient.update({
      where: { clientId },
      data,
    });

    return {
      clientId,
      clientSecret: newSecret,
      graceWindowSeconds: opts.force ? 0 : graceSeconds,
      previousSecretExpiresAt: data.previousSecretExpiresAt ?? null,
      message:
        opts.force
          ? 'Secret rotated. Previous secret revoked immediately. Save this secret — it will not be shown again.'
          : `Secret rotated. Previous secret accepted for ${graceSeconds}s. Save this secret — it will not be shown again.`,
    };
  }

  async deleteOAuthClient(clientId: string) {
    await this.prisma.authorizationCode.deleteMany({ where: { clientId } });
    await this.prisma.refreshToken.deleteMany({ where: { clientId } });
    await this.prisma.oAuthClient.delete({ where: { clientId } });
    return { success: true };
  }
}
