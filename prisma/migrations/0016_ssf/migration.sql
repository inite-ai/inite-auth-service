-- OpenID Shared Signals Framework (SSF) / CAEP — transmitter side.
-- Additive: two new tables, no changes to existing rows.

CREATE TABLE IF NOT EXISTS "ssf_streams" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "streamId"        TEXT NOT NULL,
  "companyId"       TEXT,
  "status"          TEXT NOT NULL DEFAULT 'enabled',
  "deliveryMethod"  TEXT NOT NULL,
  "pushEndpointUrl" TEXT,
  "pushAuthHeader"  TEXT,
  "eventsRequested" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "aud"             TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ssf_streams_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ssf_streams_streamId_key" ON "ssf_streams" ("streamId");
CREATE INDEX IF NOT EXISTS "ssf_streams_companyId_idx" ON "ssf_streams" ("companyId");

CREATE TABLE IF NOT EXISTS "set_deliveries" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "streamId"      UUID NOT NULL,
  "jti"           TEXT NOT NULL,
  "eventType"     TEXT NOT NULL,
  "sub"           TEXT NOT NULL,
  "setJwt"        TEXT NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'pending',
  "attempts"      INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "lastError"     TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt"   TIMESTAMP(3),
  CONSTRAINT "set_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "set_deliveries_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "ssf_streams"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "set_deliveries_jti_key" ON "set_deliveries" ("jti");
CREATE INDEX IF NOT EXISTS "set_deliveries_streamId_status_idx" ON "set_deliveries" ("streamId", "status");
CREATE INDEX IF NOT EXISTS "set_deliveries_status_nextAttemptAt_idx" ON "set_deliveries" ("status", "nextAttemptAt");
