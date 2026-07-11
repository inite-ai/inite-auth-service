# mTLS (RFC 8705) — operator runbook

Enables mutual-TLS client authentication + certificate-bound access tokens on a
**separate host** (`mtls-auth-api.inite.ai`) so the primary hosts
(`auth.inite.ai`, `auth-api.inite.ai`) are never asked for a client certificate.

The app layer already shipped (behind `MTLS_ENABLED`); this wires the edge. TLS
is terminated at Traefik, which verifies the client cert against a CA and
forwards the leaf to the backend as `X-Forwarded-Tls-Client-Cert` — trusted by
`MtlsService` exactly like `X-Forwarded-For`.

**The primary hosts are untouched by every step below**, so a misconfiguration
here cannot take down normal traffic.

## Prerequisites
- A client CA (PEM) that issues the client certificates, **or** self-signed
  client certs whose public keys are registered on the OAuth client's JWKS
  (`self_signed_tls_client_auth`).

## Steps (in order)
1. **DNS** — point `mtls-auth-api.inite.ai` at the same host as `auth-api`.
2. **CA into Traefik** — mount the client CA read-only into the global Traefik
   container at `/etc/traefik/mtls/client-ca.pem`.
3. **Dynamic config** — install [`traefik-mtls-dynamic.yml`](./traefik-mtls-dynamic.yml)
   into the global Traefik's file provider (defines the `mtls-client-auth`
   `tls.options` the router references). Confirm Traefik loads it with no error.
4. **Deploy env** — set on the auth-service deploy env (GitHub Actions secrets →
   `.env`):
   - `MTLS_ENABLED=true`
   - `MTLS_TRUSTED_CA_CERT` = the same CA PEM (the app re-validates the chain;
     keep it in sync with step 2). Not needed for `self_signed_tls_client_auth`.
   `MTLS_CLIENT_CERT_HEADER` and `MTLS_ISSUER` are already set in
   `docker-compose.prod.yml`.
5. **Provision a client** — via the admin API, set the OAuth client's
   `tokenEndpointAuthMethod` to `tls_client_auth` (+ `tlsClientAuthSubjectDn`) or
   `self_signed_tls_client_auth` (+ register the cert's public key in `jwks`).
6. **Redeploy** the auth-service so `MTLS_ENABLED` takes effect.

## Verify
```bash
# mTLS host authenticates the client and mints a cert-bound token:
curl --cert client.crt --key client.key \
  -d 'grant_type=client_credentials&client_id=<id>&scope=<scope>' \
  https://mtls-auth-api.inite.ai/v1/oauth/token
# → decode the access_token: cnf must carry "x5t#S256".

# Discovery advertises the binding + aliases:
curl https://auth-api.inite.ai/.well-known/oauth-authorization-server \
  | jq '{tls_client_certificate_bound_access_tokens, mtls_endpoint_aliases}'

# The primary host still works WITHOUT a client cert:
curl https://auth-api.inite.ai/health
```

## Rollback
- App: unset `MTLS_ENABLED` (or set `false`) and redeploy — mTLS auth + binding
  stop; nothing else changes.
- Edge: remove the `auth-api-mtls` router labels / the dynamic config. The
  primary routers are independent.
