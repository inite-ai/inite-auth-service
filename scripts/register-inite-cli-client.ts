/**
 * Provision the public OAuth client used by the INITE CLI device-flow
 * installer (frontend/public/login.sh).
 *
 *   npm run register-inite-cli-client
 *
 * Public clients (no client_secret) — RFC 8628 binds the auth to the
 * device_code itself, not to a separate secret. Re-running is idempotent;
 * only the non-secret fields refresh.
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

const config = {
  clientId: 'inite-cli',
  name: 'INITE CLI (device flow)',
  redirectUris: [] as string[],
  allowedScopes: ['openid', 'profile', 'email'] as string[],
  allowedGrants: [
    'urn:ietf:params:oauth:grant-type:device_code',
    'refresh_token',
  ] as string[],
  allowedAudiences: [] as string[],
};

async function main() {
  console.log('🖥️  Registering INITE CLI device-flow OAuth client...\n');

  const existing = await prisma.oAuthClient.findUnique({
    where: { clientId: config.clientId },
  });

  if (existing) {
    await prisma.oAuthClient.update({
      where: { clientId: config.clientId },
      data: {
        name: config.name,
        redirectUris: config.redirectUris,
        allowedScopes: config.allowedScopes,
        allowedGrants: config.allowedGrants,
        allowedAudiences: config.allowedAudiences,
        active: true,
      },
    });
    console.log(`✅ Client '${config.name}' updated.`);
  } else {
    // Schema requires clientSecretHash; device flow doesn't validate it,
    // but we stash a hash of a random throwaway value so the column is
    // never empty (avoids surprising any consumer code that assumes a hash).
    const throwaway = crypto.randomBytes(32).toString('hex');
    const clientSecretHash = await bcrypt.hash(throwaway, 10);
    await prisma.oAuthClient.create({
      data: {
        clientId: config.clientId,
        clientSecretHash,
        name: config.name,
        redirectUris: config.redirectUris,
        allowedScopes: config.allowedScopes,
        allowedGrants: config.allowedGrants,
        allowedAudiences: config.allowedAudiences,
        active: true,
      },
    });
    console.log(`✅ Registered: ${config.name}`);
  }

  console.log(`   Client ID:    ${config.clientId}`);
  console.log(`   Grants:       ${config.allowedGrants.join(', ')}`);
  console.log(`   Scopes:       ${config.allowedScopes.join(', ')}`);
  console.log(`   Public:       yes (no client_secret)\n`);
  console.log('📌 Now any user can run `curl -fsSL https://auth.inite.ai/login.sh | bash`');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
