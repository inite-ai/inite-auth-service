/**
 * Who is a superadmin, and the one way to make one when nobody can reach the
 * console.
 *
 *   node dist/cli/scripts/superadmin.js list      # read-only
 *   node dist/cli/scripts/superadmin.js check     # exit 1 while nobody verified holds the role
 *   node dist/cli/scripts/superadmin.js grant --id <uuid> --email <address>           # dry run
 *   node dist/cli/scripts/superadmin.js grant --id <uuid> --email <address> --apply
 *
 * Runs in the production image (compiled by `npm run build`, like
 * clients-apply). The id and the email must name the same verified account;
 * the grant is written to the audit log. It never creates an account.
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { adminTier } from '../src/admin/admin-scope';
import { metadataOf, planGrant, preflight, type SuperadminRow } from '../src/admin/superadmin-grant';

const args = process.argv.slice(2);
const opt = (f: string) => (args.includes(f) ? (args[args.indexOf(f) + 1] ?? '') : '');
const SELECT = { id: true, email: true, emailVerified: true, metadata: true } as const;

const show = (r: SuperadminRow) =>
  `  ${r.id}  ${r.email ?? '(no email)'}${r.emailVerified ? '' : ' (email not verified)'}`;

function list(rows: SuperadminRow[]): boolean {
  const { ok, holders, losing } = preflight(rows);
  console.log(`superadmin role on a verified account: ${holders.length}`);
  holders.forEach((r) => console.log(show(r)));
  console.log(`admins with neither the role nor a company: ${losing.length}`);
  losing.forEach((r) => console.log(show(r)));
  const unverified = rows.filter((r) => !r.emailVerified && adminTier(metadataOf(r)) === 'superadmin');
  console.log(`superadmin role on an unverified account: ${unverified.length}`);
  unverified.forEach((r) => console.log(show(r)));
  return ok;
}

async function grant(prisma: PrismaClient, rows: SuperadminRow[]): Promise<void> {
  const plan = planGrant(rows, { id: opt('--id'), email: opt('--email') });
  if (plan.kind === 'refuse') throw new Error(`refused: ${plan.reason}`);
  if (plan.kind === 'already') {
    console.log(`${plan.id} already holds the superadmin role`);
    return;
  }
  console.log(`${plan.id}: roles -> ${JSON.stringify(plan.metadata.roles)}`);
  if (!args.includes('--apply')) {
    console.log('(dry run: --apply writes it)');
    return;
  }
  await prisma.$transaction(async (tx) => {
    // Only the roles key is written, and only while the account is still the one named.
    const written = await tx.$executeRaw`
      UPDATE "users"
         SET "metadata" = (CASE WHEN jsonb_typeof("metadata") = 'object' THEN "metadata" ELSE '{}'::jsonb END)
                          || ${JSON.stringify({ roles: plan.metadata.roles })}::jsonb,
             "updatedAt" = now()
       WHERE "id" = ${plan.id}::uuid AND "email" = ${opt('--email')} AND "emailVerified"`;
    if (written !== 1) throw new Error('refused: the account changed meanwhile');
    await tx.oAuthAuditLog.create({
      data: {
        event: 'user.superadmin_granted',
        success: true,
        metadata: { userId: plan.id, via: 'scripts/superadmin' } satisfies Prisma.InputJsonObject,
      },
    });
  });
  console.log('granted');
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const rows = await prisma.user.findMany({ select: SELECT, orderBy: { createdAt: 'asc' } });
    const command = args[0];
    if (command === 'list') list(rows);
    else if (command === 'check') process.exitCode = list(rows) ? 0 : 1;
    else if (command === 'grant') await grant(prisma, rows);
    else throw new Error('usage: superadmin.js list | check | grant --id <uuid> --email <address> [--apply]');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
