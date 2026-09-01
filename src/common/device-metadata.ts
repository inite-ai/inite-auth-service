import { requestContext } from './request-context';

/** Cap stored device metadata so a hostile header cannot bloat the row. */
const MAX_USER_AGENT_LEN = 400;
const MAX_IP_LEN = 64;

/** Device fingerprint persisted alongside a user-visible session. */
export interface DeviceMetadata {
  ip: string | null;
  userAgent: string | null;
}

/**
 * Read the current request's device fingerprint for storage.
 *
 * Pulled from the ambient request context rather than threaded through every
 * caller — token issuance runs several layers below the controller, and the
 * middleware already stamps this on every inbound request. Returns nulls
 * outside a request (cron, background jobs, tests), which is the honest
 * answer: those sessions have no device.
 */
export function currentDeviceMetadata(): DeviceMetadata {
  const ctx = requestContext.get();
  return {
    ip: ctx?.ip?.slice(0, MAX_IP_LEN) || null,
    userAgent: ctx?.userAgent?.slice(0, MAX_USER_AGENT_LEN) || null,
  };
}
