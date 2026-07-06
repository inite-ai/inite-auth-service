# Tooling upgrade status

Status of the dev-tooling upgrades tracked in the refactor plan. Backend
versions live in the root `package.json`; the frontend has its own.

_Last reviewed: 2026-07-07._

## ✅ ESLint 9 → 10 (done)

Upgraded `eslint` `^9.39.4` → `^10.6.0`.

The blocker was **`eslint-plugin-import@2.32`** (latest) — its peer range caps
at `eslint ^9`, so `npm ci` failed `ERESOLVE` against ESLint 10. Resolved by
migrating to the maintained fork **`eslint-plugin-import-x@^4.17.1`**
(peer `eslint ^8.57 || ^9 || ^10`):

- `eslint.config.mjs`: plugin key `import` → `import-x`, setting
  `import/resolver` → `import-x/resolver`, rule `import/no-restricted-paths`
  → `import-x/no-restricted-paths`.
- Verified the `no-restricted-paths` clean-architecture gate still fires
  (a controller importing `src/prisma` is still an error).

CI node is `22` (ESLint 10 needs `^20.19 || ^22.13 || >=24`) — satisfied.
`typescript-eslint@8.62`, `eslint-plugin-sonarjs@4.1`, and the prettier
configs already allow ESLint 10.

## ✅ Prisma 6 → 7 (done)

Upgraded `prisma`/`@prisma/client` `^6.19.3` → `^7.8.0`. Prisma 7 ships the
Rust-free client, so the datasource URL left `schema.prisma` and the runtime
moved to a driver adapter:

- `schema.prisma`: dropped `url = env(...)` from the datasource.
- `prisma.config.ts` (new): Prisma 7 CLI config — loads `.env`, supplies the
  datasource URL + migrations path.
- `PrismaService`: `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`
  (`@prisma/adapter-pg` + `pg`); `main.ts` loads `dotenv/config` first so the
  URL is in `process.env` before the eager adapter build.
- Dockerfile: build+generate in the builder, `npm prune --omit=dev`, copy the
  pruned `node_modules` — keeps the generated client + deps linked without the
  prisma CLI in the slim image. `@prisma/client` moved to `dependencies`.

Validated against a live Postgres: `db push` in sync, `migrate diff` empty,
240-test suite, `npm run start` + the production Docker container both boot
with real DB reads/writes. Migrations remain ALTER-only (no baseline init —
pre-existing); prod applies incrementals via `migrate deploy`.

## ✅ TypeScript 5.9 → 6 (done)

Upgraded `typescript` `^5.9.3` → `^6.0.3`. The old "blocked on ts-jest" note
was wrong — `ts-jest@29.4` runs the full suite fine under TS 6. The migration
needed four behaviour-neutral config/typing fixes:

- Removed deprecated `baseUrl` + the unused `@/*` `paths` (TS7 removes baseUrl).
- Added explicit `types: ["node","jest"]` — TS6 stopped auto-including those
  ambient `@types` for this config.
- Added explicit `rootDir: "./src"` — TS6 requires it when emitting (TS5011).
- Explicit return types on the two passkey option-generators — TS6's stricter
  declaration-emit portability (TS2883) couldn't name the inferred
  `@simplewebauthn` types across the controller boundary.

Watch the `typescript-eslint@8.62` peer ceiling (`typescript <6.1.0`): a
future TS 6.1 will need a typescript-eslint bump.

## ⏸ js-yaml (no action — transitive only)

We have **no direct dependency** on `js-yaml`. The modern `4.1.1` is pulled
by `@nestjs/cli` and `@nestjs/swagger`; an old `3.14.2` is pulled deep under
the test toolchain (`ts-jest → @jest/transform → babel-plugin-istanbul →
@istanbuljs/load-nyc-config`, which pins `js-yaml ^3`). The 3.x copy is
dev/coverage-only and can't be bumped until that upstream istanbul chain
updates — nothing to do on our side.
