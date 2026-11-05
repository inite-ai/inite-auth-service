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
