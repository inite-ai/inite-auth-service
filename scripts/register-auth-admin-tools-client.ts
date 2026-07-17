/**
 * Provision the OAuth client used by `@inite/auth-admin` tools.
 *
 * Each vertical that wants to expose INITE auth-admin tools to its AI
 * agents (via the per-vertical MCP route) needs an OAuth client
 * registered here so the tool layer can mint a service token with
 * `scope=admin` and call /v1/admin/*.
 *
 * Usage:
 *   AUTH_ADMIN_TOOLS_CLIENT_SECRET=<32+ bytes> \
 *     npx ts-node scripts/register-auth-admin-tools-client.ts
 *
 * The secret is printed once on first run. After that the script
 * never touches the secret — rotate via the admin panel.
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { writeSecretToFile } from './lib/secret-out';

const prisma = new PrismaClient();

const config = {
  clientId: 'inite-auth-admin-tools',
  clientSecret:
    process.env.AUTH_ADMIN_TOOLS_CLIENT_SECRET ?? crypto.randomBytes(32).toString('hex'),
  name: 'INITE Auth-Admin Tools (M2M)',
  redirectUris: [] as string[], // M2M only — no user redirect
  allowedScopes: ['admin'] as string[],
  allowedGrants: ['client_credentials'] as string[],
  allowedAudiences: [] as string[], // any audience accepted; default = clientId
};

async function main() {
  console.log('🔐 Registering @inite/auth-admin tools OAuth client...\n');

  const existing = await prisma.oAuthClient.findUnique({
    where: { clientId: config.clientId },
  });

  if (existing) {
    console.log(`✅ Client '${config.name}' already exists.`);
    console.log('   Updating non-secret fields (scopes, grants, name)...');
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
    console.log('   ✅ Configuration updated (secret untouched).');
    console.log('\n   To rotate the secret, use the admin panel:');
    console.log('     /admin → OAuth Clients → inite-auth-admin-tools → Rotate secret');
    await prisma.$disconnect();
    return;
  }

  const clientSecretHash = await bcrypt.hash(config.clientSecret, 10);
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

  const secretPath = writeSecretToFile('AUTH_ADMIN_TOOLS_CLIENT_SECRET', config.clientSecret);
  console.log(`✅ Registered: ${config.name}`);
  console.log(`   Client ID:     ${config.clientId}`);
  console.log(`   Client Secret: written to ${secretPath} (chmod 600)`);
  console.log(`   Allowed Scopes: ${config.allowedScopes.join(', ')}`);
  console.log(`   Grants:        ${config.allowedGrants.join(', ')}\n`);

  console.log('📌 Copy the secret from that file NOW and delete it — it cannot be retrieved later.\n');
  console.log('   Set in each vertical that uses @inite/auth-admin:');
  console.log('     AUTH_ADMIN_TOOLS_CLIENT_ID=' + config.clientId);
  console.log('     AUTH_ADMIN_TOOLS_CLIENT_SECRET=<from the secrets file>');
  console.log('     AUTH_SERVICE_URL=https://auth-api.inite.ai\n');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
