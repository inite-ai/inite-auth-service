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
