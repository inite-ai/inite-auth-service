import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request data stored in AsyncLocalStorage so any code path
 * (services, audit log, error handlers) can pull the current
 * request's correlation ID without it being threaded through every
 * function signature.
 *
 * Populated by RequestContextMiddleware on every inbound HTTP
 * request. Returns undefined when no request is in flight (background
 * jobs, cron, tests).
 */
export interface RequestData {
  requestId: string;
  ip?: string;
  userAgent?: string;
}

const storage = new AsyncLocalStorage<RequestData>();

export const requestContext = {
  run<T>(data: RequestData, fn: () => T): T {
    return storage.run(data, fn);
  },
  get(): RequestData | undefined {
    return storage.getStore();
  },
  /** Convenience getter for the most-used field. */
  getRequestId(): string | undefined {
    return storage.getStore()?.requestId;
  },
};
