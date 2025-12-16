import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { OAuthClient } from '../src/database/entities';

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'inite_auth',
  entities: [OAuthClient],
  synchronize: false,
});

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
    await dataSource.initialize();
    const clientRepo = dataSource.getRepository(OAuthClient);

    console.log('🔐 Registering Smart Chat OAuth2 Client...\n');

    // Check if client already exists
    const existing = await clientRepo.findOne({
      where: { clientId: smartChatClient.clientId },
    });

    if (existing) {
      console.log(`✅ Client '${smartChatClient.name}' already exists`);
      console.log(`   Updating configuration...`);

      // Update existing client
      existing.name = smartChatClient.name;
      existing.redirectUris = smartChatClient.redirectUris;
      existing.allowedScopes = smartChatClient.allowedScopes;
      existing.allowedGrants = smartChatClient.allowedGrants;
      existing.active = true;

      // Update secret if provided
      if (process.env.SMART_CHAT_CLIENT_SECRET) {
        existing.clientSecretHash = await bcrypt.hash(smartChatClient.clientSecret, 10);
        console.log(`   Client Secret: UPDATED`);
      }

      await clientRepo.save(existing);
      console.log(`   ✅ Configuration updated!`);
    } else {
      // Hash client secret
      const clientSecretHash = await bcrypt.hash(smartChatClient.clientSecret, 10);

      // Create new client
      const newClient = clientRepo.create({
        clientId: smartChatClient.clientId,
        clientSecretHash,
        name: smartChatClient.name,
        redirectUris: smartChatClient.redirectUris,
        allowedScopes: smartChatClient.allowedScopes,
        allowedGrants: smartChatClient.allowedGrants,
        active: true,
      });

      await clientRepo.save(newClient);

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

    await dataSource.destroy();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error registering client:', error);
    process.exit(1);
  }
}

registerSmartChatClient();

