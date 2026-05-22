-- RFC 6749 §2.1 — mark public clients (no client_secret).
-- PKCE / device_code authenticate the request without a shared secret.
ALTER TABLE "OAuthClient" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
