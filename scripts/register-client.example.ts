/**
 * Example: register an OAuth2/OIDC client.
 *
 * Copy this file, adjust the `client` config for your application, and run it
 * against a running auth service (it talks to the database directly via Prisma):
 *
 *   CLIENT_SECRET=$(openssl rand -base64 32) \
 *     npx ts-node -r tsconfig-paths/register scripts/register-client.example.ts
 *
 * The secret is printed ONCE on first registration. Store it in your app's
 * backend env; rotate later via the admin panel, never by editing this script.
 *
 * For a machine-to-machine (client_credentials) client instead of an
 * interactive one, see scripts/register-auth-admin-tools-client.ts.
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

// --- Edit this block for your application -----------------------------------
const client = {
  clientId: process.env.CLIENT_ID || 'my-app',
  clientSecret: process.env.CLIENT_SECRET || crypto.randomBytes(32).toString('hex'),
  name: process.env.CLIENT_NAME || 'My Application',
  redirectUris: (process.env.CLIENT_REDIRECT_URIS ||
    'https://your-app.example.com/callback,http://localhost:3000/callback')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean),
  allowedScopes: ['openid', 'profile', 'email', 'offline_access'],
  allowedGrants: ['authorization_code', 'refresh_token'],
};
// ---------------------------------------------------------------------------

async function main() {
  console.log(`🔐 Registering OAuth client "${client.name}"...\n`);

  const existing = await prisma.oAuthClient.findUnique({
    where: { clientId: client.clientId },
  });

  if (existing) {
    // Update everything EXCEPT the secret — rotate that via the admin panel.
    await prisma.oAuthClient.update({
      where: { clientId: client.clientId },
      data: {
        name: client.name,
        redirectUris: client.redirectUris,
        allowedScopes: client.allowedScopes,
        allowedGrants: client.allowedGrants,
        active: true,
      },
    });
    console.log(`✅ Updated existing client "${client.clientId}" (secret unchanged).`);
  } else {
    const clientSecretHash = await bcrypt.hash(client.clientSecret, 10);
    await prisma.oAuthClient.create({
      data: {
        clientId: client.clientId,
        clientSecretHash,
        name: client.name,
        redirectUris: client.redirectUris,
        allowedScopes: client.allowedScopes,
        allowedGrants: client.allowedGrants,
        active: true,
      },
    });
    console.log(`✅ Registered "${client.name}"`);
    console.log(`   Client ID:     ${client.clientId}`);
    console.log(`   Client Secret: ${client.clientSecret}   <-- store this now, shown once`);
    console.log(`   Redirect URIs: ${client.redirectUris.join(', ')}`);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ Error registering client:', error);
  process.exit(1);
});
