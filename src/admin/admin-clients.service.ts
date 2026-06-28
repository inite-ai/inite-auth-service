import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";

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

    return clients.map(({ clientSecretHash, ...client }) => client);
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

    const { clientSecretHash, ...safeClient } = client;
    return {
      ...safeClient,
      stats: {
        totalAuthCodes: totalCodes,
        totalTokens,
        activeTokens,
      },
    };
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
  }) {
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
      },
    });

    const { clientSecretHash: _, ...safeClient } = client;
    return {
      ...safeClient,
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
    }>,
  ) {
    try {
      const client = await this.prisma.oAuthClient.update({
        where: { clientId },
        data,
      });
      const { clientSecretHash, ...safeClient } = client;
      return safeClient;
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

    const data: any = {
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
