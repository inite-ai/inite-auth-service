import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Smart Chat OAuth Client Configuration
const smartChatClient = {
  clientId: 'smart-chat',
  clientSecret: process.env.SMART_CHAT_CLIENT_SECRET || 'smart_chat_secret_change_in_production',
  name: 'Smart Chat (Break³)',
  redirectUris: [
    // Production
    'https://break3.inite.health/callback',
    'https://break3.inite.health/auth/callback',
    'https://break3.inite.health/silent-callback',
    // Staging
    'https://staging.break3.inite.health/callback',
    'https://staging.break3.inite.health/auth/callback',
    // Local development
    'http://localhost:3000/callback',
    'http://localhost:3000/auth/callback',
    'http://localhost:3000/silent-callback',
    'http://192.168.1.100:3000/callback', // For mobile testing
    'http://192.168.1.100:3000/auth/callback',
  ],
  allowedScopes: ['openid', 'profile', 'email', 'offline_access', 'wallet'],
  allowedGrants: ['authorization_code', 'refresh_token'],
};

async function registerSmartChatClient() {
  try {
    console.log('🔐 Registering Smart Chat OAuth2 Client...\n');

    // Check if client already exists
    const existing = await prisma.oAuthClient.findUnique({
      where: { clientId: smartChatClient.clientId },
    });

    if (existing) {
      console.log(`✅ Client '${smartChatClient.name}' already exists`);
      console.log(`   Updating configuration (NOT secret - use admin panel for rotation)...`);

      // Update existing client - but NEVER touch the secret!
      // Secret should only be changed via admin panel rotation
      await prisma.oAuthClient.update({
        where: { clientId: smartChatClient.clientId },
        data: {
          name: smartChatClient.name,
          redirectUris: smartChatClient.redirectUris,
          allowedScopes: smartChatClient.allowedScopes,
          allowedGrants: smartChatClient.allowedGrants,
          active: true,
        },
      });
      console.log(`   ✅ Configuration updated! (secret unchanged)`);
    } else {
      // Hash client secret
      const clientSecretHash = await bcrypt.hash(smartChatClient.clientSecret, 10);

      // Create new client
      await prisma.oAuthClient.create({
        data: {
          clientId: smartChatClient.clientId,
          clientSecretHash,
          name: smartChatClient.name,
          redirectUris: smartChatClient.redirectUris,
          allowedScopes: smartChatClient.allowedScopes,
          allowedGrants: smartChatClient.allowedGrants,
          active: true,
        },
      });

      console.log(`✅ Registered: ${smartChatClient.name}`);
      console.log(`   Client ID: ${smartChatClient.clientId}`);
      console.log(`   Client Secret: ${smartChatClient.clientSecret}`);
    }

    console.log('\n📋 Configuration Details:');
    console.log(`   Client ID: ${smartChatClient.clientId}`);
    console.log(`   Allowed Scopes: ${smartChatClient.allowedScopes.join(', ')}`);
    console.log(`   Redirect URIs:`);
    smartChatClient.redirectUris.forEach((uri) => {
      console.log(`     - ${uri}`);
    });

    console.log('\n⚠️  IMPORTANT:');
    console.log('   1. Store CLIENT_SECRET in backend .env as: AUTH_CLIENT_SECRET');
    console.log('   2. Store CLIENT_ID in frontend .env as: REACT_APP_AUTH_CLIENT_ID=smart-chat');
    console.log('   3. Auth Service URL: AUTH_SERVICE_URL=https://auth.inite.ai');

    await prisma.$disconnect();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error registering client:', error);
    process.exit(1);
  }
}

registerSmartChatClient();
