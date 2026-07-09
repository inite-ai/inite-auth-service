import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requestContext } from '../common/request-context';
import { MetricsService } from '../common/metrics.service';
import { AuditWebhookService } from './audit-webhook.service';
import { AuditQueryFilters } from './contracts/audit-query-filters';

/**
 * Durable audit trail for OAuth + client-lifecycle events.
 *
 * Every record() call writes one row to `oauth_audit_log`. Writes are
 * fire-and-forget at the call site (await + try/catch inside this
 * service) so a transient DB hiccup never blocks the user-facing
 * OAuth flow. The Logger fallback keeps the event in container logs
 * even when the DB write fails — operators can reconstruct from
 * either source.
 *
 * Event vocabulary (stable, queryable):
 *   token.issued.client_credentials   M2M JWT minted
 *   token.issued.authorization_code   user-flow access token minted
 *   token.refreshed                   refresh_token grant
 *   token.failed.invalid_credentials  bad client_secret
 *   token.failed.scope_violation      requested scope not allowed
 *   token.failed.audience_violation   requested audience not allowed
 *   token.failed.unsupported_grant    grant not in allowedGrants
 *   client.created                    new OAuth client provisioned
 *   client.updated                    name/grants/scopes/etc edited
 *   client.deactivated                client.active flipped to false
 *   client.deleted                    hard delete
 *   client.secret_rotated             secret rolled
 */
export interface AuditEventInput {
  event: string;
  clientId?: string | null;
  /// When the caller already has the tenant identifier handy (e.g.
  /// client_credentials flow where it's the JWT sub), pass it
  /// directly. Otherwise it's resolved from the OAuthClient row.
  companyId?: string | null;
  sub?: string | null;
  scopes?: string[];
  audience?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  success: boolean;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class OAuthAuditService {
  private readonly logger = new Logger(OAuthAuditService.name);

  // Tiny in-process cache for clientId → companyId so high-volume
  // token endpoints don't hit the DB on every audit write. OAuth
  // clients rarely change tenants, and a stale entry is at worst a
  // briefly mis-scoped audit row (the next 60s eviction clears it).
  private readonly companyIdCache = new Map<
    string,
    { companyId: string | null; cachedAt: number }
  >();
  private static readonly COMPANY_CACHE_TTL_MS = 60_000;
  /** Hard cap on a single bulk export (guards against unbounded result sets). */
  private static readonly MAX_EXPORT_ROWS = 50_000;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly webhook?: AuditWebhookService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async record(input: AuditEventInput): Promise<void> {
    try {
      const companyId = await this.resolveCompanyId(input);
      const metadata = this.buildMetadata(input);
      await this.persistAndFanOut(input, companyId, metadata);
    } catch (e: unknown) {
      // Audit log write failures must NEVER tail-latency the OAuth
      // flow — log and move on. Operators monitoring this log line
      // can correlate with the DB outage.
      this.metrics?.auditWriteFailures.inc();
      const message = e instanceof Error ? e.message : 'unknown';
      this.logger.warn(
        `audit log write failed [${input.event}]: ${message}`,
      );
    }
  }

  /**
   * Auto-attach correlation ID to audit metadata so an audit row can be
   * cross-referenced with the corresponding log lines.
   */
  private buildMetadata(
    input: AuditEventInput,
  ): Record<string, unknown> | null {
    const requestId = requestContext.getRequestId();
    return requestId
      ? { ...(input.metadata ?? {}), requestId }
      : input.metadata ?? null;
  }

  private async persistAndFanOut(
    input: AuditEventInput,
    companyId: string | null,
    metadata: Record<string, unknown> | null,
  ): Promise<void> {
    const row = await this.prisma.oAuthAuditLog.create({
      data: {
        event: input.event,
        clientId: input.clientId ?? null,
        companyId,
        sub: input.sub ?? null,
        scopes: input.scopes ?? [],
        audience: input.audience ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        success: input.success,
        errorMessage: input.errorMessage ?? null,
        metadata: metadata === null ? Prisma.DbNull : (metadata as Prisma.InputJsonValue),
      },
    });

    // Fan out to the optional webhook sink. Fire-and-forget — deliver()
    // never throws, and we don't await so a slow receiver can't tail-latency
    // the audited request.
    if (this.webhook?.enabled) {
      void this.webhook.deliver(row as unknown as Record<string, unknown>);
    }
  }

  private async resolveCompanyId(
    input: AuditEventInput,
  ): Promise<string | null> {
    if (input.companyId !== undefined) return input.companyId ?? null;
    if (!input.clientId) return null;

    const cached = this.companyIdCache.get(input.clientId);
    if (
      cached &&
      Date.now() - cached.cachedAt < OAuthAuditService.COMPANY_CACHE_TTL_MS
    ) {
      return cached.companyId;
    }

    try {
      const client = await this.prisma.oAuthClient.findUnique({
        where: { clientId: input.clientId },
        select: { companyId: true },
      });
      const companyId = client?.companyId ?? null;
      this.companyIdCache.set(input.clientId, {
        companyId,
        cachedAt: Date.now(),
      });
      return companyId;
    } catch {
      return null;
    }
  }

  /**
   * List audit-log rows with optional filters. Scoped reads pass
   * companyId; superadmin reads pass undefined to see all tenants.
   * Capped at 200 rows per page; ordering newest-first.
   */
  /**
   * Same list() shape but scoped to a single user's events (matched
   * on the `sub` column which we populate with user.did). Used by
   * the user-facing GET /v1/auth/security/audit endpoint — no
   * cross-tenant visibility, no clientId filter required (user can
   * see events across all the apps they've authorized).
   */
  async listForUser(filters: {
    sub: string;
    event?: string;
    success?: boolean;
    since?: Date;
    until?: Date;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);

    const where: Record<string, unknown> = { sub: filters.sub };
    if (filters.event) where.event = filters.event;
    if (filters.success !== undefined) where.success = filters.success;
    if (filters.since || filters.until) {
      const ts: Record<string, Date> = {};
      if (filters.since) ts.gte = filters.since;
      if (filters.until) ts.lte = filters.until;
      where.ts = ts;
    }

    const [rows, total] = await Promise.all([
      this.prisma.oAuthAuditLog.findMany({
        where,
        orderBy: { ts: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        // The user has no business seeing every internal metadata key —
        // strip the requestId/companyId/etc. that's useful to operators
        // but noise to end users. Surface only what's user-meaningful.
        select: {
          id: true,
          ts: true,
          event: true,
          success: true,
          errorMessage: true,
          ip: true,
          userAgent: true,
          clientId: true,
          scopes: true,
          audience: true,
        },
      }),
      this.prisma.oAuthAuditLog.count({ where }),
    ]);

    return {
      rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /** Translate the public filter shape into a Prisma `where`. Shared by
   *  list() and exportRows() so the scoping rules can't drift apart. */
  private buildWhere(filters: AuditQueryFilters): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (filters.companyId !== undefined) where.companyId = filters.companyId;
    if (filters.clientId) where.clientId = filters.clientId;
    if (filters.event) where.event = filters.event;
    if (filters.success !== undefined) where.success = filters.success;
    if (filters.since || filters.until) {
      const ts: Record<string, Date> = {};
      if (filters.since) ts.gte = filters.since;
      if (filters.until) ts.lte = filters.until;
      where.ts = ts;
    }
    return where;
  }

  async list(filters: AuditQueryFilters) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const where = this.buildWhere(filters);

    const [rows, total] = await Promise.all([
      this.prisma.oAuthAuditLog.findMany({
        where,
        orderBy: { ts: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.oAuthAuditLog.count({ where }),
    ]);

    return {
      rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Bulk export of audit rows for the given (already scope-applied) filters.
   * Returns up to MAX_EXPORT_ROWS most-recent rows in one shot — no pagination
   * — for CSV/JSON download. The cap is a guardrail against unbounded result
   * sets; `truncated` tells the caller whether more rows matched.
   */
  async exportRows(filters: AuditQueryFilters): Promise<{
    rows: unknown[];
    truncated: boolean;
  }> {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.oAuthAuditLog.findMany({
      where,
      orderBy: { ts: 'desc' },
      take: OAuthAuditService.MAX_EXPORT_ROWS + 1,
    });
    const truncated = rows.length > OAuthAuditService.MAX_EXPORT_ROWS;
    return {
      rows: truncated ? rows.slice(0, OAuthAuditService.MAX_EXPORT_ROWS) : rows,
      truncated,
    };
  }
}
