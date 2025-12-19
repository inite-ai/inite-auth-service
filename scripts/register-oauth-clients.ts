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

const clients = [
  {
    clientId: 'break3',
    clientSecret: process.env.BREAK3_CLIENT_SECRET || 'break3_secret_change_this',
    name: 'Break³',
    redirectUris: [
      'https://break3.inite.health/callback',
      'https://break3.inite.health/silent-callback',
      'http://localhost:3000/callback', // Dev
    ],
    allowedScopes: ['openid', 'profile', 'email', 'offline_access'],
  },
  {
    clientId: 'inite-club',
    clientSecret: process.env.CLUB_CLIENT_SECRET || 'club_secret_change_this',
    name: 'INITE Club',
    redirectUris: [
      'https://inite.club/callback',
      'https://inite.club/silent-callback',
      'http://localhost:3001/callback', // Dev
    ],
    allowedScopes: ['openid', 'profile', 'email', 'offline_access'],
  },
  {
    clientId: 'inite-health',
    clientSecret: process.env.HEALTH_CLIENT_SECRET || 'health_secret_change_this',
    name: 'INITE Health',
    redirectUris: [
      'https://inite.health/callback',
      'https://inite.health/silent-callback',
      'http://localhost:3002/callback', // Dev
    ],
    allowedScopes: ['openid', 'profile', 'email', 'offline_access'],
  },
  {
    clientId: 'inite-events',
    clientSecret: process.env.EVENTS_CLIENT_SECRET || 'events_secret_change_this',
    name: 'INITE Events',
    redirectUris: [
      'https://inite.events/callback',
      'https://inite.events/silent-callback',
      'http://localhost:3003/callback', // Dev
    ],
    allowedScopes: ['openid', 'profile', 'email', 'offline_access'],
  },
  {
    clientId: 'inite-estate',
    clientSecret: process.env.ESTATE_CLIENT_SECRET || 'estate_secret_change_this',
    name: 'INITE Estate',
    redirectUris: [
      'https://inite.estate/callback',
      'https://inite.estate/silent-callback',
      'http://localhost:3004/callback', // Dev
    ],
    allowedScopes: ['openid', 'profile', 'email', 'offline_access'],
  },
  {
    clientId: 'inite-education',
    clientSecret: process.env.EDUCATION_CLIENT_SECRET || 'education_secret_change_this',
    name: 'INITE Education',
    redirectUris: [
      'https://inite.education/callback',
      'https://inite.education/silent-callback',
      'http://localhost:3005/callback', // Dev
    ],
    allowedScopes: ['openid', 'profile', 'email', 'offline_access'],
  },
];

async function registerClients() {
  await dataSource.initialize();
  const clientRepo = dataSource.getRepository(OAuthClient);

  console.log('🔐 Registering OAuth2 clients...\n');

  for (const client of clients) {
    // Check if client already exists
    const existing = await clientRepo.findOne({
      where: { clientId: client.clientId },
    });

    if (existing) {
      console.log(`✅ Client '${client.name}' (${client.clientId}) already exists, skipping...`);
      continue;
    }

    // Hash client secret
    const clientSecretHash = await bcrypt.hash(client.clientSecret, 10);

    // Create client
    const newClient = clientRepo.create({
      clientId: client.clientId,
      clientSecretHash,
      name: client.name,
      redirectUris: client.redirectUris,
      allowedScopes: client.allowedScopes,
      allowedGrants: ['authorization_code', 'refresh_token'],
      active: true,
    });

    await clientRepo.save(newClient);

    console.log(`✅ Registered: ${client.name}`);
    console.log(`   Client ID: ${client.clientId}`);
    console.log(`   Client Secret: ${client.clientSecret}`);
    console.log(`   Redirect URIs: ${client.redirectUris.join(', ')}`);
    console.log('');
  }

  console.log('🎉 All clients registered successfully!');
  console.log('\n⚠️  IMPORTANT: Store client secrets securely in your environment variables!');

  await dataSource.destroy();
}

registerClients().catch((error) => {
  console.error('❌ Error registering clients:', error);
  process.exit(1);
});


