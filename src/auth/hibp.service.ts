import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

/**
 * HaveIBeenPwned password breach check via the k-anonymity range
 * API (https://api.pwnedpasswords.com/range/{prefix}).
 *
 * We hash the password with SHA-1, send only the first 5 hex chars
 * to HIBP, and look up the full hash suffix in the returned list.
 * The password itself never leaves this process.
 *
 * Default OFF. Operators flip on with HIBP_ENABLED=true. Reasons
 * to keep it off:
 *   - offline / air-gapped deploys
 *   - latency tail on the registration path (we cap by AbortController)
 *   - some jurisdictions want explicit user consent before any
 *     third-party password-derived metadata leaves the box
 *
 * When enabled and the password is in HIBP, register/reset throw a
 * structured "password breached" error so the UI can prompt for
 * a different password.
 */
@Injectable()
export class HibpService {
  private readonly logger = new Logger(HibpService.name);
  private readonly enabled: boolean;
  private readonly minBreachCount: number;
  private readonly timeoutMs: number;
  private readonly apiBase: string;

  constructor(private readonly config: ConfigService) {
    this.enabled =
      (this.config.get<string>('HIBP_ENABLED', 'false') ?? 'false').toLowerCase() ===
      'true';
    // Default to 1 — any sighting counts as breached. Raise via env
    // for projects that tolerate widely-circulated passwords during
    // bootstrap (not recommended).
    this.minBreachCount = parseInt(
      this.config.get<string>('HIBP_MIN_BREACH_COUNT', '1') ?? '1',
      10,
    );
    this.timeoutMs = parseInt(
      this.config.get<string>('HIBP_TIMEOUT_MS', '1500') ?? '1500',
      10,
    );
    this.apiBase = this.config.get<string>(
      'HIBP_API_BASE',
      'https://api.pwnedpasswords.com',
    ) as string;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * @returns breach count (>= 0). 0 means not found; >= minBreachCount
   * is the operator-defined threshold for "treat as breached".
   *
   * Network errors are logged and silently treated as "not breached"
   * — registration flow MUST NOT fail closed when HIBP is down. The
   * trade-off is acceptable: HIBP is supplementary defence layered
   * on top of length/complexity rules.
   */
  async breachCount(password: string): Promise<number> {
    if (!this.enabled) return 0;
    if (!password) return 0;

    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const body = await this.fetchRange(prefix);
    if (body === null) return 0;
    return this.findSuffixCount(body, suffix);
  }

  /**
   * Fetch the HIBP range body for a 5-char prefix, or null when the
   * request fails / returns non-OK (caller treats null as not breached).
   */
  private async fetchRange(prefix: string): Promise<string | null> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = `${this.apiBase.replace(/\/$/, '')}/range/${prefix}`;
      const res = await fetch(url, {
        headers: {
          // HIBP recommends an Add-Padding header for traffic-shape
          // privacy (response gets randomised filler entries).
          'Add-Padding': 'true',
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(`HIBP returned ${res.status}; treating as not breached`);
        return null;
      }
      return await res.text();
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : 'err';
      const message = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`HIBP request failed (${name}): ${message}`);
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  /** Scan a HIBP range body for the hash suffix, returning its count (0 if absent). */
  private findSuffixCount(body: string, suffix: string): number {
    for (const line of body.split('\n')) {
      const [hashSuffix, countStr] = line.trim().split(':');
      if (hashSuffix === suffix) {
        const count = parseInt(countStr ?? '0', 10);
        return Number.isFinite(count) ? count : 0;
      }
    }
    return 0;
  }

  /**
   * Throws when the password is in HIBP at or above the configured
   * threshold. Use this on registration / password reset.
   */
  async assertNotBreached(password: string): Promise<void> {
    if (!this.enabled) return;
    const count = await this.breachCount(password);
    if (count >= this.minBreachCount) {
      const error = new Error(
        `Password appears in known breach corpora (${count} sightings). Please choose a different password.`,
      ) as Error & { code?: string; breachCount?: number };
      error.code = 'password_breached';
      error.breachCount = count;
      throw error;
    }
  }
}
