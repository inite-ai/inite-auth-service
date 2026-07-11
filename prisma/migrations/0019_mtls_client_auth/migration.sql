-- RFC 8705 mTLS client authentication (PKI mode): expected certificate subject DN.
-- Additive + nullable; the self-signed variant reuses the existing jwks column,
-- and the two new tokenEndpointAuthMethod values ("tls_client_auth",
-- "self_signed_tls_client_auth") need no schema change since the column is a
-- free-form string. No backfill.
ALTER TABLE "oauth_clients" ADD COLUMN IF NOT EXISTS "tlsClientAuthSubjectDn" TEXT;
