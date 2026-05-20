import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditEventInput): Promise<void> {
    try {
      await this.prisma.oAuthAuditLog.create({
        data: {
          event: input.event,
          clientId: input.clientId ?? null,
          sub: input.sub ?? null,
          scopes: input.scopes ?? [],
          audience: input.audience ?? null,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          success: input.success,
          errorMessage: input.errorMessage ?? null,
          metadata: (input.metadata as any) ?? null,
        },
      });
    } catch (e: any) {
      // Audit log write failures must NEVER tail-latency the OAuth
      // flow — log and move on. Operators monitoring this log line
      // can correlate with the DB outage.
      this.logger.warn(
        `audit log write failed [${input.event}]: ${e?.message ?? 'unknown'}`,
      );
    }
  }
}
