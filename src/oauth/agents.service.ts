import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SsfEmitterService } from '../ssf/ssf-emitter.service';
import { CAEP_EVENTS } from '../ssf/caep-event-types';
import { ConsentService } from './consent.service';
import type { AuthorizationDetail } from './contracts/authorization-detail';
import { isWalletGrant } from './wallet-grant';

export interface AgentRef {
  id: string;
  did: string;
}

/** The `act` claim of a token an agent got for a person (RFC 8693 §4.1). */
export interface ActClaim {
  sub: string;
  client_id: string;
}

export interface AgentSummary {
  id: string;
  did: string;
  clientId: string;
  walletGrant: AuthorizationDetail | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}

const LAST_USED_GRANULARITY_MS = 60 * 60 * 1000;

/**
 * AI agents as principals.
 *
 * An agent is a third-party application acting for one person — what the
 * person let in on the consent screen. Its identifier is a did:web under this
 * server, so anyone can resolve it to a document naming the person it acts
 * for and the application it runs as. Every token the application gets for
 * that person carries the agent in `act`; `sub` stays the person. A resource
 * server (billing's wallet, an MCP server) can then tell who acts on whose
 * behalf, and keep per-agent limits and logs.
 *
 * INITE's own applications are not agents: they get no `act`.
 */
@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly ssf?: SsfEmitterService,
  ) {}

  /**
   * did:web for an agent: the issuer's host (a port percent-encoded, per the
   * did:web spec) and path `agents/<id>`, resolving to
   * `<issuer>/agents/<id>/did.json`.
   */
  didOf(agentId: string): string {
    const issuer = new URL(this.config.get<string>('JWT_ISSUER', 'http://localhost:3002'));
    const host = issuer.port ? `${issuer.hostname}%3A${issuer.port}` : issuer.hostname;
    const path = issuer.pathname.replace(/^\/+|\/+$/g, '');
    return ['did:web', host, ...(path ? path.split('/') : []), 'agents', agentId].join(':');
  }

  /**
   * The agent for this person and application, made on first use. Null for
   * INITE's own applications, which act as the person, not for them.
   */
  async forToken(userId: string, clientId: string): Promise<AgentRef | null> {
    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId },
      select: { clientId: true, firstParty: true },
    });
    if (!client || ConsentService.isFirstParty(client)) return null;

    let agent = await this.live(userId, clientId);
    if (!agent) {
      try {
        agent = await this.prisma.agent.create({ data: { userId, clientId, lastUsedAt: new Date() } });
      } catch (error) {
        // Two tokens issued at once: the other one made it.
        if ((error as { code?: string })?.code !== 'P2002') throw error;
        agent = await this.live(userId, clientId);
        if (!agent) throw error;
      }
    } else if (!agent.lastUsedAt || Date.now() - agent.lastUsedAt.getTime() > LAST_USED_GRANULARITY_MS) {
      await this.prisma.agent.update({ where: { id: agent.id }, data: { lastUsedAt: new Date() } });
    }
    return { id: agent.id, did: this.didOf(agent.id) };
  }

  /**
   * The `act` claim for a token this application gets for this person — the
   * agent, made on first use, with any wallet grant kept for the account. None
   * for INITE's own applications.
   */
  async actFor(
    userId: string,
    clientId: string,
    details?: AuthorizationDetail[],
  ): Promise<ActClaim | undefined> {
    const agent = await this.forToken(userId, clientId);
    if (!agent) return undefined;
    if (details?.length) await this.recordGrant(agent.id, details);
    return this.actClaim(agent, clientId);
  }

  /** The `act` claim for an agent's token. */
  actClaim(agent: AgentRef, clientId: string): ActClaim {
    return { sub: agent.did, client_id: clientId };
  }

  /** Keep the wallet grant the person approved, for the account page. */
  async recordGrant(agentId: string, details: AuthorizationDetail[] | undefined): Promise<void> {
    const wallet = details?.find((d) => isWalletGrant(d));
    if (!wallet) return;
    await this.prisma.agent.update({
      where: { id: agentId },
      data: { walletGrant: wallet as unknown as Prisma.InputJsonValue },
    });
  }

  /** A person's agents in use, newest first. */
  async list(userId: string): Promise<AgentSummary[]> {
    const rows = await this.prisma.agent.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      did: this.didOf(row.id),
      clientId: row.clientId,
      walletGrant: (row.walletGrant as AuthorizationDetail | null) ?? null,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
    }));
  }

  /**
   * Retire the person's agent for an application — it was disconnected.
   * Resource servers hear it as a CAEP session-revoked naming the agent, so
   * billing can take away its wallet access at once rather than when its
   * last token expires.
   */
  async revoke(userId: string, clientId: string): Promise<number> {
    const live = await this.prisma.agent.findMany({
      where: { userId, clientId, revokedAt: null },
      select: { id: true, user: { select: { did: true } } },
    });
    if (live.length === 0) return 0;
    await this.prisma.agent.updateMany({
      where: { id: { in: live.map((a) => a.id) } },
      data: { revokedAt: new Date() },
    });
    for (const agent of live) {
      await this.ssf
        ?.emit({
          eventType: CAEP_EVENTS.sessionRevoked,
          subject: agent.user.did,
          claims: { agent: this.didOf(agent.id), client_id: clientId, reason: 'agent_disconnected' },
        })
        .catch((e: Error) => this.logger.warn(`agent revoke signal failed: ${e.message}`));
    }
    return live.length;
  }

  /**
   * The agent's DID document: who controls it (the person), what it runs as
   * (the application) — and, once retired, that it is deactivated. Null when
   * there is no such agent.
   */
  async document(agentId: string): Promise<{ document: Record<string, unknown>; deactivated: boolean } | null> {
    if (!/^[0-9a-f-]{36}$/i.test(agentId)) return null;
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        user: { select: { did: true } },
        client: { select: { clientId: true, name: true } },
      },
    });
    if (!agent) return null;
    const id = this.didOf(agent.id);
    return {
      deactivated: !!agent.revokedAt,
      document: {
        '@context': ['https://www.w3.org/ns/did/v1'],
        id,
        controller: agent.user.did,
        alsoKnownAs: [],
        service: [
          {
            id: `${id}#client`,
            type: 'OAuthClient',
            serviceEndpoint: {
              client_id: agent.client.clientId,
              name: agent.client.name,
            },
          },
        ],
      },
    };
  }

  private live(userId: string, clientId: string) {
    return this.prisma.agent.findFirst({ where: { userId, clientId, revokedAt: null } });
  }
}
