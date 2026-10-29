/**
 * Seed the family demo tenant in auth: the «Atlântica Group» org and its
 * three credential-less personas (src/organizations/demo-tenant.ts).
 *
 *   npm run seed-demo-org                         # dry run: what would be written
 *   DEMO_ORG_SEED=1 npm run seed-demo-org -- --apply
 *
 * Both the flag and --apply are needed to write. Idempotent: the org is keyed
 * by its fixed id, the personas by their reserved .invalid addresses, the
 * memberships by (user, org). A persona never gets a password, passkey or
 * federated identity; if one already has any, the run stops and touches
 * nothing. The owner runs it on prod; agents only prepare it.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import { DidService } from '../src/identity/did.service';
import {
  DEMO_METADATA,
  DEMO_ORG_COMPANY_ID,
  DEMO_ORG_ID,
  DEMO_ORG_NAME,
  DEMO_ORG_SLUG,
  DEMO_PERSONAS,
} from '../src/organizations/demo-tenant';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply') && process.env.DEMO_ORG_SEED === '1';
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const org = await prisma.organization.findUnique({ where: { id: DEMO_ORG_ID } });
    const clash = await prisma.organization.findFirst({
      where: { OR: [{ slug: DEMO_ORG_SLUG }, { companyId: DEMO_ORG_COMPANY_ID }], NOT: { id: DEMO_ORG_ID } },
      select: { id: true, slug: true },
    });
    if (clash) throw new Error(`another org already holds slug "${DEMO_ORG_SLUG}" or ${DEMO_ORG_COMPANY_ID} (${clash.id}); resolve it first`);
    console.log(`${org ? '=' : '+'} org ${DEMO_ORG_SLUG} (${DEMO_ORG_ID}) "${DEMO_ORG_NAME}"`);

    const users = await prisma.user.findMany({
      where: { email: { in: DEMO_PERSONAS.map((p) => p.email) } },
      include: { passkeys: { select: { id: true } }, oauthIdentities: { select: { id: true } }, wallets: { select: { id: true } } },
    });
    for (const u of users) {
      if (u.passwordHash || u.passkeys.length || u.oauthIdentities.length || u.wallets.length) {
        throw new Error(`demo persona ${u.email} has a credential; a persona never does. Nothing written.`);
      }
    }
    for (const p of DEMO_PERSONAS) console.log(`${users.some((u) => u.email === p.email) ? '=' : '+'} persona ${p.key} ${p.email} (${p.orgRole})`);

    if (!apply) {
      console.log('\n(dry run: DEMO_ORG_SEED=1 and --apply write it)');
      return;
    }

    const did = new DidService(new ConfigService());
    await prisma.$transaction(async (tx) => {
      await tx.organization.upsert({
        where: { id: DEMO_ORG_ID },
        create: { id: DEMO_ORG_ID, companyId: DEMO_ORG_COMPANY_ID, slug: DEMO_ORG_SLUG, name: DEMO_ORG_NAME, metadata: DEMO_METADATA },
        update: { name: DEMO_ORG_NAME, metadata: DEMO_METADATA },
      });
      for (const p of DEMO_PERSONAS) {
        const existing = await tx.user.findUnique({ where: { email: p.email } });
        // The key pair is thrown away: the DID is only an identifier here.
        const user =
          existing ??
          (await tx.user.create({
            data: { did: (await did.generateDid()).did, email: p.email, emailVerified: false, name: p.name, metadata: { ...DEMO_METADATA, persona: p.key } },
          }));
        await tx.membership.upsert({
          where: { userId_organizationId: { userId: user.id, organizationId: DEMO_ORG_ID } },
          create: { userId: user.id, organizationId: DEMO_ORG_ID, role: p.orgRole, status: 'active' },
          update: { role: p.orgRole, status: 'active' },
        });
      }
    });
    console.log('\nseeded.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(`seed-demo-org: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
