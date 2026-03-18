import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Smart Chat Admin OAuth Client Configuration
const adminClient = {
  clientId: 'smart-chat-admin',
  clientSecret: process.env.SMART_CHAT_ADMIN_CLIENT_SECRET || 'smart_chat_admin_secret_change_in_production',
  name: 'Smart Chat Admin Panel',
  redirectUris: [
    // Production
    'https://admin.break3.inite.health/auth-callback',
    // Staging
    'https://staging-admin.break3.inite.health/auth-callback',
    // Local development
    'http://localhost:3080/auth-callback',
  ],
  allowedScopes: ['openid', 'profile', 'email', 'admin'], // admin scope!
  allowedGrants: ['authorization_code', 'refresh_token'],
};

async function registerAdminClient() {
  try {
    console.log('🔐 Registering Smart Chat Admin OAuth2 Client...\n');

    // Check if client already exists
    const existing = await prisma.oAuthClient.findUnique({
      where: { clientId: adminClient.clientId },
    });

    if (existing) {
      console.log(`✅ Client '${adminClient.name}' already exists`);
      console.log(`   Updating configuration (NOT secret - use admin panel for rotation)...`);

      // Update existing client - but NEVER touch the secret!
      // Secret should only be changed via admin panel rotation
      await prisma.oAuthClient.update({
        where: { clientId: adminClient.clientId },
        data: {
          name: adminClient.name,
          redirectUris: adminClient.redirectUris,
          allowedScopes: adminClient.allowedScopes,
          allowedGrants: adminClient.allowedGrants,
          active: true,
        },
      });
      console.log(`   ✅ Configuration updated! (secret unchanged)`);
    } else {
      const clientSecretHash = await bcrypt.hash(adminClient.clientSecret, 10);

      await prisma.oAuthClient.create({
        data: {
          clientId: adminClient.clientId,
          clientSecretHash,
          name: adminClient.name,
          redirectUris: adminClient.redirectUris,
          allowedScopes: adminClient.allowedScopes,
          allowedGrants: adminClient.allowedGrants,
          active: true,
        },
      });

      console.log(`✅ Registered: ${adminClient.name}`);
      console.log(`   Client ID: ${adminClient.clientId}`);
      console.log(`   Client Secret: ${adminClient.clientSecret}`);
    }

    console.log('\n📋 Configuration Details:');
    console.log(`   Client ID: ${adminClient.clientId}`);
    console.log(`   Allowed Scopes: ${adminClient.allowedScopes.join(', ')}`);
    console.log(`   Redirect URIs:`);
    adminClient.redirectUris.forEach((uri) => {
      console.log(`     - ${uri}`);
    });

    console.log('\n⚠️  IMPORTANT:');
    console.log('   1. Store CLIENT_SECRET in admin .env as: REACT_APP_ADMIN_CLIENT_SECRET');
    console.log('   2. Add to admin .env: REACT_APP_USE_OAUTH=true');
    console.log('   3. Auth Service URL: REACT_APP_AUTH_SERVICE_URL=https://auth.inite.ai');

    await prisma.$disconnect();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error registering admin client:', error);
    process.exit(1);
  }
}

registerAdminClient();
