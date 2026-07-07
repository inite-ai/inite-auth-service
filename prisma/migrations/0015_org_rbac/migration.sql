-- Organizations / Teams + relational RBAC. Additive: replaces the ad-hoc
-- metadata.roles string array with a relational model, bridged to the existing
-- companyId tenant string via Organization.companyId.

CREATE TABLE IF NOT EXISTS "organizations" (
  "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "companyId" TEXT NOT NULL,
  "slug"      TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "metadata"  JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_companyId_key" ON "organizations" ("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_key" ON "organizations" ("slug");

CREATE TABLE IF NOT EXISTS "memberships" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId"         UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "role"           TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'active',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "memberships_userId_organizationId_key" ON "memberships" ("userId", "organizationId");
CREATE INDEX IF NOT EXISTS "memberships_organizationId_idx" ON "memberships" ("organizationId");
CREATE INDEX IF NOT EXISTS "memberships_userId_idx" ON "memberships" ("userId");

CREATE TABLE IF NOT EXISTS "org_roles" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID,
  "slug"           TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "permissions"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "org_roles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "org_roles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "org_roles_organizationId_slug_key" ON "org_roles" ("organizationId", "slug");

-- Backfill an organization per existing tenant string. id is generated
-- explicitly (gen_random_uuid) so the seed does not depend on a column default
-- — the table may have been created by `prisma db push`, which puts the uuid
-- default in the query engine, not the DB.
INSERT INTO "organizations" ("id", "companyId", "slug", "name")
  SELECT gen_random_uuid(), "companyId", "companyId", "companyId"
  FROM (SELECT DISTINCT "companyId" FROM "oauth_clients" WHERE "companyId" IS NOT NULL) AS t
  ON CONFLICT ("companyId") DO NOTHING;

-- Seed built-in system roles (organizationId = NULL). Idempotent via
-- WHERE NOT EXISTS: the (organizationId, slug) unique index treats NULL org as
-- distinct, so ON CONFLICT cannot dedupe system roles across re-runs.
INSERT INTO "org_roles" ("id", "slug", "name", "permissions")
  SELECT gen_random_uuid(), v.slug, v.name, v.permissions
  FROM (VALUES
    ('owner',  'Owner',  ARRAY['org:*']),
    ('admin',  'Admin',  ARRAY['org:read','org:members:manage','org:roles:manage']),
    ('member', 'Member', ARRAY['org:read']),
    ('viewer', 'Viewer', ARRAY['org:read'])
  ) AS v(slug, name, permissions)
  WHERE NOT EXISTS (
    SELECT 1 FROM "org_roles" r WHERE r."organizationId" IS NULL AND r.slug = v.slug
  );
