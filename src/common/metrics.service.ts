import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

/**
 * Application metrics registry. Exposes /metrics scrape data for
 * Prometheus / Grafana.
 *
 * Goals for the metric set:
 *   - alert on auth failures (credential stuffing, broken client)
 *   - SLO histograms by grant type (auth_code vs refresh vs M2M
 *     have different latency budgets — M2M is the only one we
 *     care about as hot path)
 *   - operational health (audit-log write failure rate)
 *
 * Add new metrics here, not as one-offs scattered across services —
 * a single registry keeps /metrics output clean and prevents the
 * `register Metric already registered` foot-gun.
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  readonly tokensIssued: Counter<string>;
  readonly tokenFailures: Counter<string>;
  readonly tokenLatency: Histogram<string>;
  readonly authAttempts: Counter<string>;
  readonly accountLockouts: Counter<string>;
  readonly auditWriteFailures: Counter<string>;

  constructor() {
    this.tokensIssued = new Counter({
      name: 'oauth_tokens_issued_total',
      help: 'Successful token issuances by grant type',
      labelNames: ['grant_type'] as const,
      registers: [this.registry],
    });

    this.tokenFailures = new Counter({
      name: 'oauth_token_failures_total',
      help: 'Failed token requests by grant type and reason',
      labelNames: ['grant_type', 'reason'] as const,
      registers: [this.registry],
    });

    this.tokenLatency = new Histogram({
      name: 'oauth_token_request_duration_seconds',
      help: 'Latency of /oauth/token by grant type',
      labelNames: ['grant_type', 'status'] as const,
      // Match expected ranges: M2M is fastest (~5ms ideal),
      // authorization_code touches PKCE + JWT sign (~30-100ms).
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });

    this.authAttempts = new Counter({
      name: 'auth_password_attempts_total',
      help: 'Password login attempts',
      labelNames: ['result'] as const, // 'success' | 'invalid' | 'locked'
      registers: [this.registry],
    });

    this.accountLockouts = new Counter({
      name: 'auth_account_lockouts_total',
      help: 'Times an account crossed the lockout threshold',
      registers: [this.registry],
    });

    this.auditWriteFailures = new Counter({
      name: 'audit_log_write_failures_total',
      help: 'DB write failures on the OAuth audit log',
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    // Standard process/runtime metrics (event loop lag, GC,
    // resident memory, FD count). Cheap to collect, invaluable
    // when something starts leaking.
    collectDefaultMetrics({ register: this.registry });
  }

  async expose(): Promise<{ contentType: string; body: string }> {
    return {
      contentType: this.registry.contentType,
      body: await this.registry.metrics(),
    };
  }
}
