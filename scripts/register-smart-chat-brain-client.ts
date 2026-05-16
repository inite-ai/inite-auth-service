import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Machine-to-machine OAuth client used by smar-chat-backend to call
 * inite.service.brain. Distinct from the user-facing `smart-chat`
 * client on purpose — different credentials, different grant type,
 * different scopes. Leaking either does NOT compromise the other.
 *
 * - grant: client_credentials (no user, server-to-server).
 * - scopes: full brain surface (read + write + admin). The admin
 *   scope lets the GDPR forget cascade fire — strip it from this
 *   client's allow-list if a deployment should never run forget.
 * - companyId: 'co_smar_chat'. Matches the tenant key brain shipped
 *   in BRAIN_API_KEYS for backwards compatibility — JWT-armed calls
 *   land in the same Surreal database as static-key calls.
 */
const brainClient = {
  clientId: 'smart-chat-brain',
  clientSecret:
    process.env.SMART_CHAT_BRAIN_CLIENT_SECRET ??
    'smart_chat_brain_secret_change_in_production',
  name: 'Smart Chat → Brain (M2M)',
  // No user-facing redirect — client_credentials never redirects.
  redirectUris: [] as string[],
  allowedScopes: ['brain:read', 'brain:write', 'brain:admin'],
  allowedGrants: ['client_credentials'],
  companyId: 'co_smar_chat',
};

async function registerBrainClient() {
  try {
    console.log('🔐 Registering Smart Chat → Brain M2M OAuth client...\n');

    const existing = await prisma.oAuthClient.findUnique({
      where: { clientId: brainClient.clientId },
    });

    if (existing) {
      console.log(`✅ Client '${brainClient.name}' already exists`);
      console.log(`   Updating non-secret configuration...`);
      await prisma.oAuthClient.update({
        where: { clientId: brainClient.clientId },
        data: {
          name: brainClient.name,
          redirectUris: brainClient.redirectUris,
          allowedScopes: brainClient.allowedScopes,
          allowedGrants: brainClient.allowedGrants,
          companyId: brainClient.companyId,
          active: true,
        },
      });
      console.log(`   ✅ Configuration updated! (secret unchanged)`);
    } else {
      const clientSecretHash = await bcrypt.hash(brainClient.clientSecret, 10);
      await prisma.oAuthClient.create({
        data: {
          clientId: brainClient.clientId,
          clientSecretHash,
          name: brainClient.name,
          redirectUris: brainClient.redirectUris,
          allowedScopes: brainClient.allowedScopes,
          allowedGrants: brainClient.allowedGrants,
          companyId: brainClient.companyId,
          active: true,
        },
      });
      console.log(`✅ Registered: ${brainClient.name}`);
      console.log(`   Client ID: ${brainClient.clientId}`);
      console.log(`   Client Secret: ${brainClient.clientSecret}`);
    }

    console.log('\n📋 Configuration:');
    console.log(`   Client ID:  ${brainClient.clientId}`);
    console.log(`   Grant:      ${brainClient.allowedGrants.join(', ')}`);
    console.log(`   Scopes:     ${brainClient.allowedScopes.join(', ')}`);
    console.log(`   Company ID: ${brainClient.companyId} (JWT sub claim)`);

    console.log('\n⚠️  IMPORTANT — set these in smar-chat-backend .env:');
    console.log(`   AUTH_CLIENT_ID=${brainClient.clientId}`);
    console.log(`   AUTH_CLIENT_SECRET=<plaintext from above>`);
    console.log(`   AUTH_SERVICE_URL=https://auth-api.inite.ai`);
    console.log(`   BRAIN_AUDIENCE=brain`);
    console.log(`   BRAIN_SERVICE_URL=https://brain.inite.ai`);
    console.log('\n   Remove BRAIN_API_KEY / BRAIN_ADMIN_API_KEY — no longer used.');

    await prisma.$disconnect();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error registering brain client:', error);
    process.exit(1);
  }
}

registerBrainClient();
