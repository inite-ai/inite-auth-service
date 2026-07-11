-- SAML 2.0 SP: per-tenant inbound IdP connections. The IdP signing certificate
-- is stored FieldCrypto-encrypted (idpCertEnc). Additive; no backfill.
CREATE TABLE IF NOT EXISTS "saml_connections" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "companyId"   TEXT NOT NULL,
  "slug"        TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "enabled"     BOOLEAN NOT NULL DEFAULT true,
  "idpEntityId" TEXT NOT NULL,
  "idpSsoUrl"   TEXT NOT NULL,
  "idpCertEnc"  TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "saml_connections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "saml_connections_slug_key" ON "saml_connections" ("slug");
CREATE INDEX IF NOT EXISTS "saml_connections_companyId_idx" ON "saml_connections" ("companyId");
