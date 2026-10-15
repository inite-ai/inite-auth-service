-- The RFC 8707 resource a device-flow request asked a token for. Additive
-- and nullable: pending rows minted before this get the clientId audience,
-- exactly as they did.
ALTER TABLE "device_authorizations" ADD COLUMN "resource" TEXT;
