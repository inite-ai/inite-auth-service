import { PrismaClient } from '@prisma/client';
import { FieldCrypto } from '../src/common/field-crypto';

/**
 * One-off operator migration: encrypt any TOTP secrets still stored as
 * plaintext base32. Idempotent — already-encrypted rows are skipped. Rows
 * are also lazily encrypted on next successful verify, so this script only
 * shortens the window for users who don't log in.
 *
 *   FIELD_ENCRYPTION_KEY=<key> npm run encrypt-totp-secrets
 */
async function main(): Promise<void> {
  const key = process.env.FIELD_ENCRYPTION_KEY;
  if (!key) {
    console.error('❌ FIELD_ENCRYPTION_KEY env var is required.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const crypto = FieldCrypto.fromEnv(key);

  const users = await prisma.user.findMany({
    where: { twoFactorSecret: { not: null } },
    select: { id: true, twoFactorSecret: true },
  });

  let migrated = 0;
  for (const user of users) {
    if (!user.twoFactorSecret || FieldCrypto.isEncrypted(user.twoFactorSecret)) continue;
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: crypto.encrypt(user.twoFactorSecret) },
    });
    migrated += 1;
  }

  console.log(`✅ Encrypted ${migrated} plaintext TOTP secret(s); ${users.length - migrated} already encrypted.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ Error encrypting TOTP secrets:', error);
  process.exit(1);
});
