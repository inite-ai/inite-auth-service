-- Social login / external IdP federation (P0-4).
-- One row per (provider, providerSubject) pair links an external identity
-- (Google, GitHub, generic OIDC) to a local user. Prisma model OAuthIdentity
-- maps to physical table `oauth_identities`. No provider tokens are stored.
CREATE TABLE "oauth_identities" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerSubject" TEXT NOT NULL,
    "email" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "profile" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_identities_pkey" PRIMARY KEY ("id")
);

-- A given external subject maps to exactly one local user per provider.
CREATE UNIQUE INDEX "oauth_identities_provider_providerSubject_key"
    ON "oauth_identities"("provider", "providerSubject");

CREATE INDEX "oauth_identities_userId_idx" ON "oauth_identities"("userId");

ALTER TABLE "oauth_identities"
    ADD CONSTRAINT "oauth_identities_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
