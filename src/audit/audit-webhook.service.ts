import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Optional outbound webhook sink for audit events. When AUDIT_WEBHOOK_URL is
 * set, every persisted audit row is also POSTed (fire-and-forget) to that URL
 * so a SIEM / log pipeline can ingest it in near-real-time. Delivery is
 * best-effort and time-boxed — it must never add latency or failure to the
 * auth flow. When AUDIT_WEBHOOK_SECRET is set, the body is signed with
 * HMAC-SHA256 in the `X-INITE-Signature` header (`sha256=<hex>`) so the
 * receiver can verify authenticity.
 */
@Injectable()
export class AuditWebhookService {
  private readonly logger = new Logger(AuditWebhookService.name);
  private readonly url?: string;
  private readonly secret?: string;
  private static readonly TIMEOUT_MS = 3000;

  constructor(private readonly config: ConfigService) {
    this.url = this.config.get<string>('AUDIT_WEBHOOK_URL');
    this.secret = this.config.get<string>('AUDIT_WEBHOOK_SECRET');
  }

  get enabled(): boolean {
    return !!this.url;
  }

  /** Sign a payload exactly as deliver() does — exposed for receivers/tests. */
  sign(body: string): string {
    return (
      'sha256=' +
      crypto.createHmac('sha256', this.secret ?? '').update(body).digest('hex')
    );
  }

  /**
   * Best-effort delivery. Never throws — a webhook outage must not affect the
   * audit write or the request that triggered it.
   */
  async deliver(event: Record<string, unknown>): Promise<void> {
    if (!this.url) return;
    const body = JSON.stringify({ type: 'audit.event', event });
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'inite-auth-audit-webhook',
    };
    if (this.secret) headers['X-INITE-Signature'] = this.sign(body);

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      AuditWebhookService.TIMEOUT_MS,
    );
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(`audit webhook returned HTTP ${res.status}`);
      }
    } catch (err) {
      this.logger.warn(
        `audit webhook delivery failed: ${(err as Error)?.message ?? 'unknown'}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
