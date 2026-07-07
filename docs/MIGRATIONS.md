# Database migrations — strategy & gotchas

_Last reviewed: 2026-07-07._

## How schema changes are applied

- **Production**: incremental migrations via `prisma migrate deploy` (reads the
  datasource from `prisma.config.ts` under Prisma 7). Each change ships as a new
  numbered folder under `prisma/migrations/`.
- **Fresh / local / CI dev databases**: `prisma db push` (schema sync straight
  from `prisma/schema.prisma`). This is how the local compose Postgres is set
  up — see the compose stack (`postgres` → `localhost:5434`).

## ⚠️ Migrations do NOT replay from an empty database

The `prisma/migrations/*` folders are **ALTER-only** — there is no baseline
`0000_init` that `CREATE`s the tables. `0001_convert_text_to_array` already
assumes `oauth_clients` etc. exist. So `prisma migrate deploy` against a
**brand-new empty DB fails** (`relation "oauth_clients" does not exist`).

That's intentional: the initial schema was bootstrapped with `db push`, and
prod's `_prisma_migrations` history starts from there. For any fresh
environment, **use `prisma db push`, not `migrate deploy`.**

### Why we can't just add a `0000_init` baseline of the current schema

A baseline generated from the *current* `schema.prisma` would **conflict** with
the existing incremental migrations: e.g. `0001` converts columns
`text → text[]`, but a current-schema baseline already creates them as `text[]`,
so `0001` would then fail to alter them. Prepending such a baseline breaks
from-scratch replay rather than fixing it.

### If you want pure migrate-based provisioning later

It's a deliberate, prod-coordinated maintenance task (not a quick add):

1. Squash `0001..NNNN` into a single `0000_init` that reflects the **current**
   schema (`prisma migrate diff --from-empty --to-schema prisma/schema.prisma
   --script`), and remove the old incremental folders.
2. On every environment that already has the schema (prod, staging), run
   `prisma migrate resolve --applied 0000_init` **once** so `migrate deploy`
   treats it as already applied and does not try to re-create existing tables.
3. New migrations continue on top of `0000_init` normally.

Until then: prod = incremental `migrate deploy`, fresh = `db push`.
