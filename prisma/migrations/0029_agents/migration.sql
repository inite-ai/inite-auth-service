-- AI agents as principals. Additive.
--
-- A third-party application a person let in is an agent acting for that
-- person, with its own did:web identifier carried in the `act` claim of the
-- tokens it gets. walletGrant keeps the inite_wallet limits the person
-- approved, for the account page; revokedAt retires the agent when the
-- application is disconnected (a later connection makes a new one).
CREATE TABLE IF NOT EXISTS "agents" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "clientId" TEXT NOT NULL,
  "walletGrant" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agents_userId_clientId_idx" ON "agents"("userId", "clientId");
CREATE INDEX IF NOT EXISTS "agents_clientId_idx" ON "agents"("clientId");
-- At most one live agent per person and application.
CREATE UNIQUE INDEX IF NOT EXISTS "agents_live_userId_clientId_key" ON "agents"("userId", "clientId") WHERE "revokedAt" IS NULL;

ALTER TABLE "agents"
  ADD CONSTRAINT "agents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agents"
  ADD CONSTRAINT "agents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauth_clients"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;
