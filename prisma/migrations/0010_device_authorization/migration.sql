-- RFC 8628 Device Authorization Grant state table.

CREATE TABLE IF NOT EXISTS "device_authorizations" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "deviceCodeHash" TEXT NOT NULL UNIQUE,
  "userCode"       TEXT NOT NULL UNIQUE,
  "clientId"       TEXT NOT NULL,
  "scope"          TEXT,
  "userId"         UUID,
  "status"         TEXT NOT NULL DEFAULT 'pending',
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  "lastPolledAt"   TIMESTAMP(3),
  "interval"       INTEGER NOT NULL DEFAULT 5,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "device_authorizations_userCode_idx"
  ON "device_authorizations" ("userCode");
CREATE INDEX IF NOT EXISTS "device_authorizations_expiresAt_idx"
  ON "device_authorizations" ("expiresAt");
