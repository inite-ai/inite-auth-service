import { PrismaClient } from '@prisma/client';

/**
 * Operator-driven backfill of the relational RBAC model from the legacy
 * metadata.roles + companyId scheme. Idempotent. For each user carrying a
 * metadata.companyId, ensure an Organization exists for that tenant and create
 * a Membership with the user's highest legacy role. Users without a companyId
 * are reported for manual assignment (we do not guess their tenant).
 *
 *   npm run backfill-memberships
 */
function pickRole(roles: string[]): string {
  if (roles.includes('owner')) return 'owner';
  if (roles.includes('superadmin') || roles.includes('admin')) return 'admin';
  return 'member';
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const users = await prisma.user.findMany({ select: { id: true, metadata: true } });

  let created = 0;
  const unmapped: string[] = [];
  for (const user of users) {
    const meta = (user.metadata as any) ?? {};
    const companyId: string | undefined = meta.companyId;
    if (!companyId) {
      if (Array.isArray(meta.roles) && meta.roles.length) unmapped.push(user.id);
      continue;
    }
    const org = await prisma.organization.upsert({
      where: { companyId },
      create: { companyId, slug: companyId, name: companyId },
      update: {},
    });
    await prisma.membership.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
      create: { userId: user.id, organizationId: org.id, role: pickRole(meta.roles ?? []) },
      update: {},
    });
    created += 1;
  }

  console.log(`✅ Ensured ${created} membership(s).`);
  if (unmapped.length) {
    console.log(`⚠️  ${unmapped.length} user(s) have roles but no companyId — assign manually:`);
    unmapped.forEach((id) => console.log(`   - ${id}`));
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ Error backfilling memberships:', error);
  process.exit(1);
});
