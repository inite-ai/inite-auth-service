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
    await dataSource.initialize();
    const clientRepo = dataSource.getRepository(OAuthClient);

    console.log('🔐 Registering Smart Chat Admin OAuth2 Client...\n');

    // Check if client already exists
    const existing = await clientRepo.findOne({
      where: { clientId: adminClient.clientId },
    });

    if (existing) {
      console.log(`✅ Client '${adminClient.name}' already exists`);
      console.log(`   Updating configuration...`);

      existing.name = adminClient.name;
      existing.redirectUris = adminClient.redirectUris;
      existing.allowedScopes = adminClient.allowedScopes;
      existing.allowedGrants = adminClient.allowedGrants;
      existing.active = true;

      if (process.env.SMART_CHAT_ADMIN_CLIENT_SECRET) {
        existing.clientSecretHash = await bcrypt.hash(adminClient.clientSecret, 10);
        console.log(`   Client Secret: UPDATED`);
      }

      await clientRepo.save(existing);
      console.log(`   ✅ Configuration updated!`);
    } else {
      const clientSecretHash = await bcrypt.hash(adminClient.clientSecret, 10);

      const newClient = clientRepo.create({
        clientId: adminClient.clientId,
        clientSecretHash,
        name: adminClient.name,
        redirectUris: adminClient.redirectUris,
        allowedScopes: adminClient.allowedScopes,
        allowedGrants: adminClient.allowedGrants,
        active: true,
      });

      await clientRepo.save(newClient);

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

    await dataSource.destroy();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error registering admin client:', error);
    process.exit(1);
  }
}

registerAdminClient();

