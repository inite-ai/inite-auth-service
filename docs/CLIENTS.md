# First-party OAuth clients: `clients/*.json`

Every first-party OAuth client is a manifest in `clients/`. `scripts/clients-apply.ts`
reads them, compares them with the `OAuthClient` rows (dynamic `dcr_*` clients
are ignored) and prints the difference. Nothing is written without `--apply`.

| Mode | What it does | Exit code |
|---|---|---|
| (none) | dry run: prints the diff, writes nothing | 0 |
| `--check` | prints the diff, writes nothing | 0 in sync, 2 on any drift (incl. unmanaged rows) |
| `--apply` | backs up the rows it touches to `clients-backup-<ts>.local.json` (chmod 600), then writes the diff in one transaction | 0 |
| `--apply --rotate <clientId>` | as `--apply`, plus a new secret for that client; the previous hash stays valid for two hours | 0 |

## Three shapes of manifest

**A product people sign in to** (the default): `origins` and nothing else in
the usual case. Everything follows from the family convention in
`src/clients/manifest.ts`: `<origin>/callback`, the back-channel on the first
origin, the OIDC baseline scopes (`openid profile email offline_access`) plus
any `scopes`, grants `authorization_code refresh_token`, confidential with
`client_secret_post`. Unknown keys are refused, at the top, in `overrides` and
in `secret`.

**A machine client** (`"kind": "machine"`): a backend that calls another
service as itself and signs no one in, e.g. `break3-backend` calling billing.

```json
{
  "clientId": "break3-backend",
  "name": "Break3 backend (billing service client)",
  "kind": "machine",
  "repo": "inite-ai/break3-backend",
  "scopes": ["billing:checkout", "billing:commitments"],
  "audiences": ["https://billing.inite.ai/v1/services"],
  "secret": { "name": "BILLING_AUTH_CLIENT_SECRET" }
}
```

It derives no redirect URIs, no back-channel, grants exactly
`client_credentials`, scopes exactly as listed (no OIDC baseline; an OIDC
scope is refused), audiences as listed, confidential with `client_secret_post`.
`scopes` and `audiences` (https, on a family domain) are required; `origins`,
`overrides`, `outsideFamily` and `customerLane` are refused.

**A public client** (`overrides.public: true`): a sign-in with PKCE and no
secret, auth method `none`. It is written as a product manifest whose
override says so, with its reason, e.g. `floripa`:

```json
"overrides": {
  "reason": "the floripa-bot portal signs in as a public PKCE client ...",
  "public": true,
  "callbackPath": "/api/auth/inite/callback",
  "grants": ["authorization_code"],
  "scopes": ["openid", "profile", "email"],
  "backchannelLogoutUri": null
}
```

A public manifest must set `backchannelLogoutUri` to `null` (a public client
is never notified), and may not carry `secret`, `client_credentials` or token
exchange. clients-apply never delivers a secret for it: a new public client is
created with the hash of a throwaway value nobody receives (the column is
required), and `--rotate` on it is refused.

Overrides, for every product manifest:

| Override | Effect |
|---|---|
| `callbackPath` | replaces `/callback` on every origin |
| `extraRedirectUris` | redirect URIs kept in addition, during a migration |
| `backchannelLogoutUri` | a back-channel on another host, or `null` for none |
| `grants` | replaces the default grants |
| `scopes` | replaces the baseline: exactly these scopes; keeps `openid`; not together with top-level `scopes` |
| `public` | `true`: public client, auth method `none` (see above) |

`offline_access` among the scopes needs the `refresh_token` grant.

## Locally (repo checkout, ts-node)

```sh
DATABASE_URL=postgresql://... npm run clients:apply
DATABASE_URL=postgresql://... npm run clients:apply -- --check
DATABASE_URL=postgresql://... npm run clients:apply -- --apply
```

## In the production container

The image carries the compiled script (`dist/cli/scripts/clients-apply.js`, built
by `npm run build` through `tsconfig.scripts.json`) and the manifests of the
commit it was built from (`dist/cli/clients/`). `DATABASE_URL` is already set in
the container. Deploy the reviewed commit first: the container applies the
manifests it was built with, not the ones on your machine.

```sh
docker exec inite-auth-service node dist/cli/scripts/clients-apply.js            # dry run
docker exec inite-auth-service node dist/cli/scripts/clients-apply.js --check    # exit 2 on drift
docker exec inite-auth-service node dist/cli/scripts/clients-apply.js --apply    # write it
```

`--apply` leaves its backup inside the container, in `/app`. Copy it out and
remove it (the name is printed on the `backup of N row(s):` line):

```sh
docker cp inite-auth-service:/app/clients-backup-<ts>.local.json .
docker exec inite-auth-service rm /app/clients-backup-<ts>.local.json
```

### New clients and rotations: secrets

A dry run, `--check`, and an `--apply` that creates no client and rotates
nothing never mint a secret and never call `gh`. A new client or `--rotate`
mints one, and by default hands it to `gh secret set` over stdin. The image has
no `gh`, so there that step fails before any row is written (the database stays
as it was). In the container, use the file sink instead:

```sh
docker exec inite-auth-service node dist/cli/scripts/clients-apply.js --apply --secret-sink file
docker exec inite-auth-service node dist/cli/scripts/clients-apply.js --apply --rotate inite-rent --secret-sink file
```

The plaintext goes to `/app/client-secrets.local.env` (chmod 600), never to
stdout, one line per secret: `<CLIENT_ID_UPPER>_<secret.name>=<value>`.
Move it where it belongs without printing it, then delete the file. For
`inite-rent` (`"repo": "inite-ai/initerent"`, `"secret": {"name": "OAUTH_CLIENT_SECRET"}`),
from a machine with `gh`:

```sh
ssh <prod> docker exec inite-auth-service sed -n 's/^INITE_RENT_OAUTH_CLIENT_SECRET=//p' /app/client-secrets.local.env \
  | gh secret set OAUTH_CLIENT_SECRET --repo inite-ai/initerent
ssh <prod> docker exec inite-auth-service rm /app/client-secrets.local.env
```

(`--env <environment>` on `gh secret set` when the manifest names one.)

Or run the new-client/rotation step from a machine that has `gh` and reaches
the database (`npm run clients:apply -- --apply`), where the secret goes
straight to the client's repository.
