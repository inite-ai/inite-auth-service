#!/usr/bin/env node
/**
 * Bring any database to the current schema — the one migration entrypoint.
 *
 *   node scripts/migrate.js
 *
 * Runs before the app in the container (Dockerfile CMD), in the production
 * deploy step, and from start.sh. Every path ends in `prisma migrate deploy`;
 * what happens first depends on what the database already holds:
 *
 *   empty            Nothing to reconcile. `migrate deploy` builds the schema
 *                    from 0000_baseline up. Rows left in _prisma_migrations by
 *                    an earlier failed attempt on the empty database (the old
 *                    start.sh did exactly that) are cleared first — there is
 *                    no schema they could describe.
 *
 *   tracked          _prisma_migrations has applied rows (production, and any
 *                    install upgraded with `migrate deploy`). These databases
 *                    predate 0000_baseline: their schema was bootstrapped
 *                    before tracking began. 0000_baseline is recorded as
 *                    applied — never executed — and `migrate deploy` applies
 *                    whatever is newer.
 *
 *   untracked        Tables exist but no migration ever completed: an install
 *                    built with `prisma db push`, which the docs prescribed up
 *                    to v1.11.x. The schema is matched against the objects
 *                    each migration introduces (PROBES); the migrations it
 *                    already reflects are recorded as applied and the rest
 *                    run for real. A schema that matches no prefix of the
 *                    history is refused rather than guessed at.
 *
 * Idempotent: on an up-to-date database it records nothing and `migrate
 * deploy` reports nothing to apply. A Postgres advisory lock serialises
 * concurrent runs (replicas booting together); `migrate deploy` takes its own.
 *
 * SKIP_DB_MIGRATE=1 skips the whole step — for operators who migrate out of
 * band.
 */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'prisma', 'migrations');
const BASELINE = '0000_baseline';
const ARRAYS_MIGRATION = '0001_convert_text_to_array';
// Distinct from Prisma's own migrate lock (72707369) so the two never contend.
const LOCK_KEY = 72707370;

/**
 * The object each migration introduces, used only to adopt an untracked
 * (`db push`) database. Frozen: every database built from now on is tracked,
 * so a migration added after 0030 never needs a probe.
 */
const PROBES = [
  ['0001_convert_text_to_array', { table: 'oauth_clients', column: 'redirectUris', array: true }],
  ['0002_security_hardening', { table: 'refresh_tokens', column: 'tokenLookup' }],
  ['0003_oauth_client_companyid', { table: 'oauth_clients', column: 'companyId' }],
  ['0004_oauth_allowed_audiences', { table: 'oauth_clients', column: 'allowedAudiences' }],
  ['0005_oauth_audit_log', { table: 'oauth_audit_log' }],
  ['0006_user_account_lockout', { table: 'users', column: 'failedLoginCount' }],
  [
    '0007_oauth_nonce_and_secret_rotation',
    { table: 'oauth_clients', column: 'previousSecretHash' },
  ],
  ['0008_tenant_isolation_companyid', { table: 'refresh_tokens', column: 'companyId' }],
  ['0009_oidc_backchannel_acr', { table: 'oauth_clients', column: 'backchannelLogoutUri' }],
  ['0010_device_authorization', { table: 'device_authorizations' }],
  ['0011_oauth_client_is_public', { table: 'oauth_clients', column: 'isPublic' }],
  ['0012_oauth_identity_federation', { table: 'oauth_identities' }],
  ['0013_authcode_resource', { table: 'authorization_codes', column: 'resource' }],
  ['0014_client_auth_privatekeyjwt', { table: 'client_assertion_jti' }],
  ['0015_org_rbac', { table: 'organizations' }],
  ['0016_ssf', { table: 'ssf_streams' }],
  ['0017_federation_providers', { table: 'federation_providers' }],
  ['0018_authorization_details', { table: 'authorization_codes', column: 'authorizationDetails' }],
  ['0019_mtls_client_auth', { table: 'oauth_clients', column: 'tlsClientAuthSubjectDn' }],
  ['0020_scim_membership_external_id', { table: 'memberships', column: 'externalId' }],
  ['0021_saml_connections', { table: 'saml_connections' }],
  ['0022_app_settings', { table: 'app_settings' }],
  ['0023_api_keys', { table: 'api_keys' }],
  ['0024_agent_policy_channels', { table: 'api_keys', column: 'policyNames' }],
  ['0025_refresh_token_device_metadata', { table: 'refresh_tokens', column: 'lastUsedAt' }],
  ['0026_oauth_consent', { table: 'oauth_consents' }],
  ['0027_refresh_token_resource', { table: 'refresh_tokens', column: 'resource' }],
  ['0028_device_authorization_resource', { table: 'device_authorizations', column: 'resource' }],
  ['0029_agents', { table: 'agents' }],
];

function log(msg) {
  console.log(`[migrate] ${msg}`);
}

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const user = encodeURIComponent(process.env.DB_USER || 'postgres');
  const pass = encodeURIComponent(process.env.DB_PASSWORD || '');
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const name = process.env.DB_NAME || 'inite_auth';
  return `postgresql://${user}:${pass}@${host}:${port}/${name}`;
}

function schemaOf(url) {
  try {
    return new URL(url).searchParams.get('schema') || 'public';
  } catch {
    return 'public';
  }
}

function localMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter(
      (d) => d.isDirectory() && fs.existsSync(path.join(MIGRATIONS_DIR, d.name, 'migration.sql')),
    )
    .map((d) => d.name)
    .sort();
}

function prismaCli() {
  const cli = path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js');
  if (!fs.existsSync(cli)) {
    throw new Error(`prisma CLI not found at ${cli} — is the "prisma" package installed?`);
  }
  return cli;
}

function prisma(args) {
  log(`prisma ${args.join(' ')}`);
  const res = spawnSync(process.execPath, [prismaCli(), ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
  if (res.status !== 0) {
    throw new Error(`prisma ${args.join(' ')} exited with ${res.status ?? res.signal}`);
  }
}

async function inspect(db, schema) {
  const { rows: tables } = await db.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
    [schema],
  );
  const names = tables.map((t) => t.table_name);
  const appTables = names.filter((n) => n !== '_prisma_migrations');
  let history = [];
  if (names.includes('_prisma_migrations')) {
    const { rows } = await db.query(
      `SELECT migration_name, finished_at, rolled_back_at FROM "${schema}"."_prisma_migrations"`,
    );
    history = rows;
  }
  const applied = new Set(
    history.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name),
  );
  return { appTables, history, applied };
}

async function probeHolds(db, schema, probe) {
  if (!probe.column) {
    const { rowCount } = await db.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
      [schema, probe.table],
    );
    return rowCount > 0;
  }
  const { rows } = await db.query(
    `SELECT data_type FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
    [schema, probe.table, probe.column],
  );
  if (rows.length === 0) return false;
  return probe.array ? rows[0].data_type === 'ARRAY' : true;
}

/** Index into PROBES of the newest migration the schema reflects, or -1. */
async function reflectedPrefix(db, schema) {
  const holds = [];
  for (const [, probe] of PROBES) holds.push(await probeHolds(db, schema, probe));
  const last = holds.lastIndexOf(true);
  const gaps = PROBES.filter((_, i) => i <= last && !holds[i]).map(([name]) => name);
  if (gaps.length) {
    throw new Error(
      `untracked database matches no prefix of the migration history — it has objects from ` +
        `${PROBES[last][0]} but not from ${gaps.join(', ')}. Refusing to guess; ` +
        `reconcile it by hand (docs/MIGRATIONS.md).`,
    );
  }
  return last;
}

async function adoptUntracked(db, schema, state) {
  const missing = ['users', 'oauth_clients'].filter((t) => !state.appTables.includes(t));
  if (missing.length) {
    throw new Error(
      `schema "${schema}" has tables but not ${missing.join(', ')} — this does not look like an ` +
        `INITE Auth database. Point DATABASE_URL at an empty database or an existing install.`,
    );
  }
  log(`untracked database (${state.appTables.length} tables, no applied migrations) — adopting`);
  if (!(await probeHolds(db, schema, PROBES[0][1]))) {
    // Pre-0001 shape: comma/brace text columns. migrate-arrays.js normalises
    // the data and converts them the way production's were, so 0001 counts
    // as reflected below.
    log('oauth_clients array columns are still text — converting (scripts/migrate-arrays.js)');
    const res = spawnSync(process.execPath, [path.join(__dirname, 'migrate-arrays.js')], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: databaseUrl() },
    });
    if (res.status !== 0) throw new Error('migrate-arrays.js failed');
  }
  const last = await reflectedPrefix(db, schema);
  if (state.history.length) {
    // Only failed or rolled-back rows can be here (none applied) — the
    // leftovers of a `migrate deploy` that failed before `db push` was used.
    log(`clearing ${state.history.length} unfinished row(s) from _prisma_migrations`);
    await db.query(`DELETE FROM "${schema}"."_prisma_migrations"`);
  }
  const reflected = [BASELINE, ...PROBES.slice(0, last + 1).map(([name]) => name)];
  log(
    `schema reflects ${reflected[reflected.length - 1]} — recording ${reflected.length} migration(s) as applied`,
  );
  for (const name of reflected) prisma(['migrate', 'resolve', '--applied', name]);
}

async function run() {
  if (process.env.SKIP_DB_MIGRATE === '1') {
    log('SKIP_DB_MIGRATE=1 — skipping');
    return;
  }
  const url = databaseUrl();
  process.env.DATABASE_URL = url; // prisma.config.ts reads it
  const schema = schemaOf(url);
  const local = localMigrations();
  if (local[0] !== BASELINE) throw new Error(`expected ${BASELINE} to be the first migration`);

  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await db.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    const state = await inspect(db, schema);

    if (state.appTables.length === 0) {
      if (state.history.length) {
        log(`empty schema with ${state.history.length} stale _prisma_migrations row(s) — clearing`);
        await db.query(`DELETE FROM "${schema}"."_prisma_migrations"`);
      }
      log('empty database — building the schema from migrations');
    } else if (state.applied.size === 0) {
      await adoptUntracked(db, schema, state);
    } else {
      if (!state.applied.has(BASELINE)) {
        log(`tracked database without ${BASELINE} — recording it as applied (not executed)`);
        prisma(['migrate', 'resolve', '--applied', BASELINE]);
      }
      // Databases that began tracking before 0001 was recorded: it was applied
      // by scripts/migrate-arrays.js, never by Prisma (the old deploy step
      // resolved it on every run).
      if (!state.applied.has(ARRAYS_MIGRATION) && (await probeHolds(db, schema, PROBES[0][1]))) {
        log(`${ARRAYS_MIGRATION} already reflected in the schema — recording it as applied`);
        prisma(['migrate', 'resolve', '--applied', ARRAYS_MIGRATION]);
      }
    }

    prisma(['migrate', 'deploy']);
    log('database is up to date');
  } finally {
    await db.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    await db.end();
  }
}

run().catch((err) => {
  console.error(`[migrate] FAILED: ${err.message}`);
  process.exit(1);
});
