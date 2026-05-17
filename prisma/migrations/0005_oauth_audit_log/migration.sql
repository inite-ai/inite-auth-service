-- Durable audit trail for OAuth + client lifecycle events.
--
-- Replaces console-only `logger.oauth(...)` with a queryable table
-- so security forensics, GDPR DSAR fulfilment, and compliance
-- reviews don't depend on container log retention.
--
-- Indexed on (clientId, ts) for "who's calling this M2M client
-- and when" lookups, and on (event, ts) for global "all token
-- failures in the last hour" sweeps.
--
-- Retention is operator concern (suggest 90-180d hot, archive to
-- cold storage) — schema has no built-in TTL.

CREATE TABLE "oauth_audit_log" (
  "id"           uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  "ts"           timestamp      NOT NULL DEFAULT now(),
  "event"        text           NOT NULL,
  "clientId"     text,
  "sub"          text,
  "scopes"       text[]         DEFAULT ARRAY[]::text[],
  "audience"     text,
  "ip"           text,
  "userAgent"    text,
  "success"      boolean        NOT NULL,
  "errorMessage" text,
  "metadata"     jsonb
);

CREATE INDEX "oauth_audit_log_clientId_ts_idx"
  ON "oauth_audit_log" ("clientId", "ts" DESC);

CREATE INDEX "oauth_audit_log_event_ts_idx"
  ON "oauth_audit_log" ("event", "ts" DESC);
