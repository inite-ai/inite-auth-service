import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Dynamically registered clients: third parties by construction. */
const DCR_PREFIX = 'dcr_';

export interface ConsentQuestion {
  userId: string;
  clientId: string;
  /** The normalised, space-separated scope being requested. */
  scope: string;
  /** RFC 9396 grants, if the request carries any. */
  authorizationDetails?: unknown;
}

export interface ConnectedApp {
  clientId: string;
  name: string;
  logoUrl: string | null;
  scopes: string[];
  grantedAt: Date;
  updatedAt: Date;
}

/**
 * Whether a person has to be asked before an application gets a code.
 *
 * Not for INITE's own applications (`firstParty`), and not when the person
 * has already approved every scope now requested. Always for a request that
 * carries RFC 9396 authorization_details: those are specific to the request
 * (this agent, these tools), so an earlier yes does not cover them.
 */
@Injectable()
export class ConsentService {
  constructor(private readonly prisma: PrismaService) {}

  static isFirstParty(client: { clientId: string; firstParty?: boolean | null }): boolean {
    return !!client.firstParty && !client.clientId.startsWith(DCR_PREFIX);
  }

  static scopesOf(scope: string | null | undefined): string[] {
    return (scope ?? '').split(/\s+/).filter(Boolean);
  }

  async isRequired(q: ConsentQuestion): Promise<boolean> {
    if (q.authorizationDetails) return true;

    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId: q.clientId },
      select: { clientId: true, firstParty: true },
    });
    if (!client) return true;
    if (ConsentService.isFirstParty(client)) return false;

    const consent = await this.prisma.oAuthConsent.findUnique({
      where: { userId_clientId: { userId: q.userId, clientId: q.clientId } },
      select: { scopes: true },
    });
    if (!consent) return true;
    const approved = new Set(consent.scopes);
    return ConsentService.scopesOf(q.scope).some((s) => !approved.has(s));
  }

  /** Remember an approval, adding its scopes to any given before. */
  async record(userId: string, clientId: string, scope: string): Promise<void> {
    const scopes = ConsentService.scopesOf(scope);
    const existing = await this.prisma.oAuthConsent.findUnique({
      where: { userId_clientId: { userId, clientId } },
      select: { scopes: true },
    });
    const merged = [...new Set([...(existing?.scopes ?? []), ...scopes])];
    await this.prisma.oAuthConsent.upsert({
      where: { userId_clientId: { userId, clientId } },
      create: { userId, clientId, scopes: merged },
      update: { scopes: merged },
    });
  }

  /** The applications a person has let in, newest first. */
  async list(userId: string): Promise<ConnectedApp[]> {
    const rows = await this.prisma.oAuthConsent.findMany({
      where: { userId },
      include: { client: { select: { name: true, logoUrl: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => ({
      clientId: r.clientId,
      name: r.client.name,
      logoUrl: r.client.logoUrl,
      scopes: r.scopes,
      grantedAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /**
   * Disconnect an application: forget the consent and revoke its refresh
   * tokens, so it has to ask again rather than carry on quietly.
   */
  async revoke(userId: string, clientId: string): Promise<{ revokedTokens: number }> {
    const [, tokens] = await this.prisma.$transaction([
      this.prisma.oAuthConsent.deleteMany({ where: { userId, clientId } }),
      this.prisma.refreshToken.updateMany({
        where: { userId, clientId, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      }),
    ]);
    return { revokedTokens: tokens.count };
  }
}
