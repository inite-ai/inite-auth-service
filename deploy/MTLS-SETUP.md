# mTLS (RFC 8705) — operator runbook

Mutual-TLS client authentication + certificate-bound access tokens on a
**separate host** (`mtls-auth-api.inite.ai`) so the primary hosts
(`auth.inite.ai`, `auth-api.inite.ai`) are never asked for a client certificate.

TLS is terminated at the global Traefik, which verifies the client cert against
the INITE Client CA and forwards the leaf to the backend as
`X-Forwarded-Tls-Client-Cert` — trusted by `MtlsService` exactly like
`X-Forwarded-For`. The app re-validates the chain, matches the subject DN,
checks the revocation deny-list and binds the cert's `x5t#S256` into `cnf`.

**The primary hosts are untouched by every step below**, so a misconfiguration
here cannot take down normal traffic.

## The CA: INITE Client CA (decided 22.10.2026)

Our own private CA, `tls_client_auth` (PKI mode). EC P-384, 10-year root,
`O=INITE, CN=INITE Client CA`, `pathLen:0` (it signs leaves only).

- Key + cert live on the owner's machine: `~/.config/inite/mtls-ca/ca.key`
  (600, dir 700) and `ca.crt`. **The key never goes to a server, a secret store
  or a repo**; keep an offline backup. Only `ca.crt` is published.
- Losing the key = no new certs until a new CA is rolled out (both places below
  plus every client re-issued). A leaked key = roll the CA immediately.

## Edge (once)
1. **DNS** — `mtls-auth-api.inite.ai` → the server's IP **directly** (not
   Cloudflare-proxied: the proxy would terminate TLS and drop the client cert).
2. **CA into Traefik** — the global Traefik mounts only its file provider
   (`/opt/traefik/dynamic` → `/etc/traefik/dynamic`), so the CA goes inside it:
   `scp ca.crt root@<host>:/opt/traefik/dynamic/mtls/client-ca.pem`.
   A `.pem` is ignored by the file provider (it reads `.yml`/`.toml` only).
3. **TLS options** — install [`traefik-mtls-dynamic.yml`](./traefik-mtls-dynamic.yml)
   as `/opt/traefik/dynamic/mtls-client-auth.yml` (defines `mtls-client-auth`,
   `caFiles: /etc/traefik/dynamic/mtls/client-ca.pem`). Confirm
   `docker logs traefik-global` shows no TLS-options error.
4. **Router** — set the repository variable **`MTLS_EDGE=true`** and redeploy:
   the deploy adds [`docker-compose.mtls.yml`](./docker-compose.mtls.yml) as
   `docker-compose.override.yml`. Let's Encrypt issues the host's server cert
   over HTTP-01 (port 80), which works because DNS is direct.

## App (runtime settings, no redeploy)
Admin → Settings, or `PUT /v1/admin/settings/<key>` `{ "value": "..." }` as a
superadmin:
- `MTLS_TRUSTED_CA_CERT` = the `ca.crt` PEM (same file as step 2);
- `MTLS_ENABLED` = `true`.

`MTLS_CLIENT_CERT_HEADER` and `MTLS_ISSUER` are set in `docker-compose.prod.yml`.

## Issuing a client certificate
[`mtls/issue-client-cert.sh`](./mtls/issue-client-cert.sh), run on the
machine holding the CA key.

**A partner** generates its own key and sends us a CSR — the private key
never leaves them:
```bash
# partner side
openssl ecparam -name prime256v1 -genkey -noout -out client.key
openssl req -new -key client.key -subj "/O=Partner Ltd/CN=partner-billing-sync" -out client.csr
# our side (optionally fix the DN ourselves rather than trust the CSR's)
deploy/mtls/issue-client-cert.sh sign client.csr client.crt --subject "/O=Partner Ltd/CN=partner-billing-sync"
```
The script prints the serial, expiry, the **`tlsClientAuthSubjectDn`** to put
on the OAuth client and the `x5t#S256`. Send back `client.crt` and
`ca.crt`. Certs are 1 year, `extendedKeyUsage=clientAuth`, `CA:FALSE`.

**Our own test clients**: `issue-client-cert.sh new "/O=INITE/CN=<name>" <dir>`
generates key + CSR in `<dir>` and signs it.

**Register the client** (admin API): `tokenEndpointAuthMethod: tls_client_auth`,
`tlsClientAuthSubjectDn` = the printed DN (compared case- and order-insensitively
per RDN), the grants and scopes it needs. The client calls the token endpoint
on `https://mtls-auth-api.inite.ai/v1/oauth/token` with its cert.

DN uniqueness is the binding: give every client its own `CN`; never reuse a DN
across clients.

## Renewal
Issue a new cert with the **same subject DN** before `notAfter` (the client may
reuse its key and send a fresh CSR). No change on the OAuth client is needed;
the old cert keeps working until it expires — revoke it (below) if it must stop
sooner. Tokens bound to the old cert stop being usable at resource servers that
enforce `cnf` once the client switches certs; it just fetches a new token.

## Revocation
Traefik checks no CRL/OCSP, so revocation is app-side: the runtime setting
**`MTLS_REVOKED_CERTS`** (comma-separated) lists certs that must never
authenticate, by `x5t#S256`, hex SHA-256 fingerprint
(`openssl x509 -fingerprint -sha256`) or hex serial
(`openssl x509 -serial`). It is checked on every mTLS client authentication,
for both RFC 8705 methods, before anything else. To cut a client off entirely,
also disable the OAuth client or change its `tlsClientAuthSubjectDn`.
Access tokens already minted stay valid until they expire (short TTL); revoke
them through the usual token revocation if that matters.

## Verify
```bash
curl --cert client.crt --key client.key \
  -d 'grant_type=client_credentials&client_id=<id>&scope=<scope>' \
  https://mtls-auth-api.inite.ai/v1/oauth/token
# → the access_token's cnf["x5t#S256"] equals the cert's thumbprint.

curl -s https://auth-api.inite.ai/.well-known/oauth-authorization-server \
  | jq '{tls_client_certificate_bound_access_tokens, mtls_endpoint_aliases}'

curl https://mtls-auth-api.inite.ai/health          # no cert → TLS handshake refused
curl https://auth-api.inite.ai/health               # primary host: no cert asked
```

## Rollback
- App: set `MTLS_ENABLED=false` in Admin → Settings — mTLS auth + binding stop.
- Edge: set `MTLS_EDGE` to anything but `true` and redeploy (the router goes),
  then remove `/opt/traefik/dynamic/mtls-client-auth.yml`. The primary routers
  are independent.
