import { LoggerService } from './logger.service';

/**
 * Error handler for intentional fire-and-forget promises.
 *
 * Non-blocking paths (audit writes, user notifications, SSF/webhook delivery)
 * are deliberately not awaited so a slow/failed receiver can't tail-latency the
 * request. But they must never be swallowed *silently* — a lost failed-login
 * audit or a dropped lockout notification is a forensic gap. Attach this so the
 * promise can't reject unhandled AND the failure is logged at warn.
 *
 *   somePromise().catch(swallow(this.logger, 'audit login.failed'))
 */
export function swallow(
  logger: LoggerService,
  label: string,
): (err: unknown) => void {
  return (err: unknown) =>
    logger.warn(
      `${label} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
}
