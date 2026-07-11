-- Operator-tunable runtime settings: DB overrides for env-provided config keys
-- (feature flags, token TTLs, RAR types, mTLS config). Env stays the fallback.
CREATE TABLE IF NOT EXISTS "app_settings" (
  "key"       TEXT NOT NULL,
  "value"     TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);
