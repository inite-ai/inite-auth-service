-- The RFC 8707 resource a refresh token's access tokens are bound to.
-- Additive and nullable: rows minted before this keep rotating to the
-- clientId audience exactly as they did.
ALTER TABLE "refresh_tokens" ADD COLUMN "resource" TEXT;
