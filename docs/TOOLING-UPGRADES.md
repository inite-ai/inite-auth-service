# Tooling upgrade status

Status of the dev-tooling upgrades tracked in the refactor plan. Backend
versions live in the root `package.json`; the frontend has its own.

_Last reviewed: 2026-06-28._

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

## ⏸ Prisma 6 → 7 (deferred — needs live DB)

`prisma`/`@prisma/client` `^6.19.3`; latest is `7.8.0` (node engine OK for
CI). Not a peer block — it's a **breaking major**: schema/config changes and
client API changes that must be validated with a real migration against a
live Postgres (this repo's tests mock Prisma, so they won't catch migration
or query-shape regressions). Do this in a dedicated PR with a staging DB:
run `prisma migrate`, review the 6→7 breaking-changes guide, and smoke the
token/identity flows against real data before merging.

## ⏸ TypeScript 5.9 → 6 (deferred — breaking major)

`typescript` `^5.9.3`; latest is `6.0.3`. Peers no longer block it
(`ts-jest@29.4` allows `>=4.3 <7`; `typescript-eslint@8.62` allows
`>=4.8.4 <6.1.0`, i.e. 6.0.x is in range). The remaining risk is the
**major itself**: 6.0 tightens checks and removes deprecated APIs, so it
needs a full `tsc` compat pass across `src`, `test`, and the frontend, plus
a re-run of the whole suite. Worth its own PR; keep an eye on the
`typescript-eslint <6.1.0` ceiling (a future TS 6.1 will need a
typescript-eslint bump too).

## ⏸ js-yaml (no action — transitive only)

We have **no direct dependency** on `js-yaml`. The modern `4.1.1` is pulled
by `@nestjs/cli` and `@nestjs/swagger`; an old `3.14.2` is pulled deep under
the test toolchain (`ts-jest → @jest/transform → babel-plugin-istanbul →
@istanbuljs/load-nyc-config`, which pins `js-yaml ^3`). The 3.x copy is
dev/coverage-only and can't be bumped until that upstream istanbul chain
updates — nothing to do on our side.
