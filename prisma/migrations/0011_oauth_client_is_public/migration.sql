-- RFC 6749 §2.1 — mark public clients (no client_secret).
-- PKCE / device_code authenticate the request without a shared secret.
-- Prisma model OAuthClient maps to physical table `oauth_clients`.
ALTER TABLE "oauth_clients" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
