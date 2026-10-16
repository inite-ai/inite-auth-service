import { Request } from "express";

/** IP + UA pulled off the request, threaded into audit records. */
export type AuditCtx = { ip: string; userAgent: string };

/** Standard OAuth token response (authorization_code / refresh / device). */
export interface IssuedTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  idToken: string;
  scope: string;
}

/** RFC 8693 Token Exchange grant-type identifier. */
export const TOKEN_EXCHANGE_GRANT =
  "urn:ietf:params:oauth:grant-type:token-exchange";

/** Pulls IP + UA off the request for audit log enrichment. */
export function clientContext(req: Request): AuditCtx {
  const fwd = (req.headers["x-forwarded-for"] as string | undefined) ?? "";
  const ip = fwd.split(",")[0]?.trim() || req.ip || "";
  return {
    ip,
    userAgent: (req.headers["user-agent"] as string | undefined) ?? "",
  };
}

/**
 * The audience a client_credentials request asks for. `audience` (the
 * historical parameter) wins; otherwise the RFC 8707 `resource` indicator
 * — what an RFC 8707-aware client (an MCP SDK, an agent) sends. Without
 * this fallback `resource` was silently ignored and the token came back
 * bound to the client id, which every resource server then rejected.
 *
 * Backward compatible on purpose: a `resource` the client's
 * `allowedAudiences` does not permit is still ignored (the client default
 * applies, as before), rather than turning a request that used to succeed
 * into a 400. An explicit `audience` keeps its strict allow-list check.
 * A repeated `resource` (parsed as an array) is a multi-resource request,
 * which a single-audience token cannot honour: only the first is used.
 */
export function requestedAudience(
  body: { audience?: unknown; resource?: unknown },
  allowedAudiences: readonly string[] = [],
): string | undefined {
  const first = (raw: unknown): string | undefined => {
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };
  const audience = first(body.audience);
  if (audience) return audience;
  const resource = first(body.resource);
  if (!resource) return undefined;
  return allowedAudiences.length === 0 || allowedAudiences.includes(resource)
    ? resource
    : undefined;
}
