-- 0032_customer_lane — additive, default false, no backfill.
--
-- The customer lane (owner decision 29.10.2026): a tenant's own customers get
-- INITE accounts, passwordless, holding a `customer` role in the company's
-- org. A client opts in with oauth_clients.customerLane; every existing client
-- stays false, so nothing changes until a client is marked and
-- CUSTOMER_LANE_ENABLED is on.
ALTER TABLE "oauth_clients" ADD COLUMN IF NOT EXISTS "customerLane" BOOLEAN NOT NULL DEFAULT false;

-- The built-in `customer` system role, beside owner/admin/member/viewer
-- (0015). No permissions: a customer is an account in the org, never staff.
-- The code catalog (src/rbac/permissions.ts) is what RBAC reads; this row
-- keeps the table in step with it. Idempotent the same way as 0015.
INSERT INTO "org_roles" ("id", "slug", "name", "permissions")
  SELECT gen_random_uuid(), 'customer', 'Customer', ARRAY[]::text[]
  WHERE NOT EXISTS (
    SELECT 1 FROM "org_roles" r WHERE r."organizationId" IS NULL AND r.slug = 'customer'
  );
