# Database migrations — strategy & gotchas

_Last reviewed: 2026-10-16._

## One path for every database

Every install — a brand-new empty Postgres, production, or a self-hosted
instance being upgraded — is migrated by the same command:

```bash
node scripts/migrate.js        # or: npm run migrate
```

You normally never type it. The container runs it before starting the app
(`Dockerfile` CMD: `node scripts/migrate.js && exec node dist/main`), and the
production deploy runs it once before bringing the app up
(`.github/workflows/deploy.yml`). `./start.sh` and `docker compose up` need no
migration step.

Underneath it is `prisma migrate deploy`, run with the prisma CLI the lockfile
pins (the CLI is a runtime dependency, so the image never downloads one). What
happens before that depends on what the database holds:

| Database | What `migrate.js` does first | Then |
|---|---|---|
| **Empty** | nothing (clears stale `_prisma_migrations` rows left by an earlier failed attempt, if any) | `migrate deploy` builds the schema from `0000_baseline` up |
| **Tracked** — `_prisma_migrations` has applied rows (production; anything upgraded with `migrate deploy`) | records `0000_baseline` as applied, **without running it** (once; a no-op afterwards) | `migrate deploy` applies whatever is newer |
| **Untracked** — tables but no applied migration (installs built with `prisma db push`, as these docs said to up to v1.11.x) | matches the schema against the object each migration introduces and records the ones it already reflects as applied; refuses if the schema matches no prefix of the history | `migrate deploy` applies the rest for real |

It is idempotent: on an up-to-date database it records nothing and
`migrate deploy` reports `No pending migrations to apply`. Concurrent runs
(several replicas booting together) are serialised by a Postgres advisory
lock. `SKIP_DB_MIGRATE=1` skips it, for operators who migrate out of band.

## The history

- **`0000_baseline`** — the schema as it stood when migration tracking began.
  The original database was bootstrapped with `prisma db push`, and `0001…`
  were written as ALTERs on top of it, so until this baseline existed
  `migrate deploy` on an empty database failed at `0001`
  (`relation "oauth_clients" does not exist`). The baseline is the current
  schema minus everything `0001…` add. Its three `oauth_clients` array
  columns are already `text[]`: on production they were converted by
  `scripts/migrate-arrays.js` before tracking and `0001` was only marked
  applied, so replaying `0001` over them is a no-op cast.
- **`0001…0029`** — the incremental history, unchanged. Existing databases
  already have these rows.
- **`0030_reconcile_schema_drift`** — the hand-written migrations left a few
  differences against `schema.prisma` (foreign keys without
  `ON UPDATE CASCADE`, a leftover `refresh_tokens_tokenHash_key` unique index,
  database-side `gen_random_uuid()`/`updatedAt` defaults the client never
  uses), and `db push` installs differ the other way (no empty-array default
  on `api_keys.scopes`/`policyNames`, `timestamp(3)` audit `ts`). `0030` makes
  both kinds match the schema exactly. Every statement is idempotent and none
  rewrites a table or touches a row.

### Why a baseline before `0001`, not a squash

Squashing `0001…0029` into a single `0000_init` of the current schema would
make a fresh install work, but it would break upgrades: every existing
database would have to be marked as having `0000_init` applied, which is only
true if it is already at the squash point. A v1.11.2 install (migrations up to
`0025`) marked that way would silently never get `0026…0029`. Keeping the
history and prepending the state it starts from works for a database at any
version, and changes nothing on databases that already have it — they gain
one bookkeeping row.

## Verified in CI

`scripts/ci/verify-migration-paths.sh` (CI job `migrations`) runs the image
against a real Postgres for each case and requires success, an empty
`prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma`,
unchanged seeded rows, and a second run that applies nothing:

1. **fresh** — an empty database;
2. **tracked** — a v1.11.2 install built the way production's was
   (pre-tracking schema, `migrate-arrays.js`, `0001` resolved, `0002…0025`
   applied by v1.11.2's own `migrate deploy`);
3. **untracked** — a v1.11.2 self-host built the way its docs said (the old
   `start.sh`'s `migrate deploy` fails on the empty database and leaves a
   failed `0001` row, then `prisma db push`).

(Prisma 7 removed `--from-url`; `--from-config-datasource` reads
`DATABASE_URL` through `prisma.config.ts`.)

## Adding a migration

Unchanged: add `prisma/migrations/NNNN_description/migration.sql`
(append-only — never edit a shipped one; see CONTRIBUTING.md). Generate it
against a database built from migrations, so it starts from what installs
really have:

```bash
npm run migrate                               # bring your local DB up to date
npx prisma migrate diff --from-config-datasource \
  --to-schema prisma/schema.prisma --script   # the SQL for your schema change
```

The probe list in `migrate.js` covers `0001…0029` only and never needs
extending: every database built from now on is tracked.

## Local development

`docker compose up -d postgres redis`, then `npm run migrate` (or
`npm run prisma:migrate` — `migrate dev` — to author a new migration).
`prisma db push` still works for a throwaway database, but a database built
that way is untracked; `migrate.js` will adopt it, so prefer `npm run migrate`.
