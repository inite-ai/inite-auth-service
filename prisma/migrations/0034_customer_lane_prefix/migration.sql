-- 0034_customer_lane_prefix — additive, nullable, no backfill.
--
-- Storefront orgs (issue #304, owner approval 08.11.2026). A customer-lane
-- client with a prefix (clients/<id>.json customerLanePrefix, e.g. "shop-")
-- may upsert its own tenants' orgs through PUT /v1/customer-lane/orgs/:slug,
-- each slug starting with that prefix so products never collide on the
-- family-wide unique Organization.slug. Existing clients have none, which is
-- true: none of them creates orgs. clients:apply writes it from the manifests.
-- Adding a nullable column rewrites nothing.
ALTER TABLE "oauth_clients" ADD COLUMN IF NOT EXISTS "customerLanePrefix" TEXT;
