-- RFC 8707 Resource Indicators: bind an authorization_code's issued
-- access-token audience to the resource requested at /authorize.
ALTER TABLE "authorization_codes" ADD COLUMN "resource" TEXT;
