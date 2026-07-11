-- SCIM 2.0 (RFC 7643) inbound provisioning: the provisioning IdP's stable
-- externalId for a user within a tenant, stored on the membership (per-org,
-- since each IdP owns its own id-space). Additive + nullable, no backfill.
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
CREATE INDEX IF NOT EXISTS "memberships_organizationId_externalId_idx"
  ON "memberships" ("organizationId", "externalId");
