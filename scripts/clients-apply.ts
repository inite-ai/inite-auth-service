/**
 * Apply clients/*.json to the database: the one way a first-party OAuth
 * client is created or changed. No hand-written SQL.
 *
 *   npm run clients:apply                  # dry run (default): the diff, read-only
 *   npm run clients:apply -- --check       # exit 2 on any drift (the daily probe)
 *   npm run clients:apply -- --apply       # write it, in one transaction, after a backup
 *   npm run clients:apply -- --apply --rotate inite-rent
 *
 * Secrets: a new client (or --rotate) gets 32 random bytes. The plaintext is
 * never printed: it goes over stdin to `gh secret set <secret.name> --repo
 * <repo> [--env <environment>]`, or with `--secret-sink file` to the chmod-600
 * client-secrets.local.env (scripts/lib/secret-out.ts). Only the bcrypt hash
 * reaches the database. A rotation keeps the previous hash for two hours.
 *
 * It runs where DATABASE_URL reaches the auth database (today: docker exec in
 * the auth container on the prod host), from a reviewed commit.
 */

import { execFileSync } from 'node:child_process';
import { closeSync, fchmodSync, openSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';
import * as crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { loadManifests } from '../src/clients/load';
import { type ClientManifest, type ClientRow, deriveClient, describePlan, MANAGED_FIELDS, planApply } from '../src/clients/manifest';
import { writeSecretToFile } from './lib/secret-out';

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const opt = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
const ROTATE_GRACE_MS = 2 * 60 * 60 * 1000;

const SELECT = Object.fromEntries([...MANAGED_FIELDS, 'clientId'].map((f) => [f, true])) as Record<keyof ClientRow, true>;

function deliverSecret(m: ClientManifest, secret: string): void {
  const sink = opt('--secret-sink') ?? 'gh';
  if (sink === 'file') {
    const path = writeSecretToFile(`${m.clientId.toUpperCase().replace(/-/g, '_')}_${m.secret?.name ?? 'CLIENT_SECRET'}`, secret);
    console.log(`  secret for ${m.clientId}: written to ${path} (chmod 600); move it, then delete the file`);
    return;
  }
  if (!m.repo || !m.secret) throw new Error(`${m.clientId}: no repo/secret in the manifest, so the secret has nowhere to go`);
  const ghArgs = ['secret', 'set', m.secret.name, '--repo', m.repo, ...(m.secret.environment ? ['--env', m.secret.environment] : [])];
  // stdin only: the value never appears in argv, the environment or a log.
  execFileSync('gh', ghArgs, { input: secret, stdio: ['pipe', 'ignore', 'inherit'] });
  console.log(`  secret for ${m.clientId}: set as ${m.repo} ${m.secret.name}`);
}

function backup(rows: unknown[]): string {
  const path = resolve(`clients-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.local.json`);
  const fd = openSync(path, 'wx', 0o600);
  try {
    fchmodSync(fd, 0o600);
    writeSync(fd, JSON.stringify(rows, null, 1));
  } finally {
    closeSync(fd);
  }
  return path;
}

async function main(): Promise<void> {
  const manifests = loadManifests();
  const wanted = manifests.map(deriveClient);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const current = (await prisma.oAuthClient.findMany({ where: { NOT: { clientId: { startsWith: 'dcr_' } } }, select: SELECT })) as ClientRow[];
    const plan = planApply(wanted, current);
    const rotate = opt('--rotate');
    console.log(describePlan(plan));
    if (rotate) console.log(`* rotate the secret of ${rotate}`);

    const drift = plan.create.length + plan.update.length + plan.unmanaged.length > 0;
    if (flag('--check')) process.exit(drift ? 2 : 0);
    if (!flag('--apply')) {
      console.log('\n(dry run: nothing written; --apply to write)');
      return;
    }

    const touched = [...plan.update.map((u) => u.clientId), ...(rotate ? [rotate] : [])];
    const before = await prisma.oAuthClient.findMany({ where: { clientId: { in: touched } } });
    if (before.length) console.log(`backup of ${before.length} row(s): ${backup(before)}`);

    const byId = new Map(manifests.map((m) => [m.clientId, m]));
    // Secrets are minted and delivered before the rows that hash them are
    // written: a failed delivery leaves the database as it was.
    const minted = new Map<string, string>();
    for (const id of [...plan.create.map((c) => c.clientId), ...(rotate ? [rotate] : [])]) {
      const m = byId.get(id);
      if (!m) throw new Error(`--rotate ${id}: no manifest`);
      const secret = crypto.randomBytes(32).toString('base64url');
      deliverSecret(m, secret);
      minted.set(id, await bcrypt.hash(secret, 10));
    }

    await prisma.$transaction(async (tx) => {
      for (const c of plan.create) {
        await tx.oAuthClient.create({ data: { ...c, clientSecretHash: minted.get(c.clientId)! } });
      }
      for (const u of plan.update) {
        const data = Object.fromEntries(Object.entries(u.changes).map(([f, d]) => [f, d!.to]));
        await tx.oAuthClient.update({ where: { clientId: u.clientId }, data });
      }
      if (rotate && !plan.create.some((c) => c.clientId === rotate)) {
        const row = await tx.oAuthClient.findUniqueOrThrow({ where: { clientId: rotate }, select: { clientSecretHash: true } });
        await tx.oAuthClient.update({
          where: { clientId: rotate },
          data: {
            clientSecretHash: minted.get(rotate)!,
            previousSecretHash: row.clientSecretHash,
            previousSecretExpiresAt: new Date(Date.now() + ROTATE_GRACE_MS),
          },
        });
      }
    });

    const after = planApply(wanted, (await prisma.oAuthClient.findMany({ where: { NOT: { clientId: { startsWith: 'dcr_' } } }, select: SELECT })) as ClientRow[]);
    console.log(`\napplied. Now: ${describePlan({ ...after, unmanaged: [] })}`);
    if (after.unmanaged.length) console.log(`unmanaged, left as they are: ${after.unmanaged.join(', ')}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`clients-apply: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
