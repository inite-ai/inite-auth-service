-- Convert text columns storing PostgreSQL array format to actual text[] arrays
-- Data is already in {val1,val2} format so USING ::text[] works directly

ALTER TABLE "oauth_clients" ALTER COLUMN "redirectUris" TYPE text[] USING "redirectUris"::text[];
ALTER TABLE "oauth_clients" ALTER COLUMN "allowedScopes" TYPE text[] USING "allowedScopes"::text[];
ALTER TABLE "oauth_clients" ALTER COLUMN "allowedGrants" TYPE text[] USING "allowedGrants"::text[];
