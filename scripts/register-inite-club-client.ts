import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function registerIniteClubClient() {
  const clientId = 'inite-club';
  const clientSecret = crypto.randomBytes(32).toString('base64url');
  const clientSecretHash = await bcrypt.hash(clientSecret, 10);

  const redirectUris = [
    'http://localhost:3000/callback',
    'http://localhost:3000/silent-callback',
    'https://inite.club/callback',
    'https://inite.club/silent-callback',
    'https://www.inite.club/callback',
    'https://www.inite.club/silent-callback',
  ];

  // Check if client already exists
  const existing = await prisma.oAuthClient.findUnique({
    where: { clientId },
  });

  if (existing) {
    // Update only configuration, NOT the secret
    await prisma.oAuthClient.update({
      where: { clientId },
      data: {
        redirectUris,
      },
    });
    console.log('✅ INITE Club OAuth2 client configuration updated (secret unchanged)');
    console.log('');
    console.log('Client ID:', clientId);
    console.log('⚠️  Secret was NOT changed. Use admin panel to rotate secrets.');
    await prisma.$disconnect();
    return;
  }

  // Create new client only if it doesn't exist
  await prisma.oAuthClient.create({
    data: {
      clientId,
      clientSecretHash,
      name: 'INITE Club',
      redirectUris,
      allowedGrants: ['authorization_code', 'refresh_token'],
    },
  });

  console.log('✅ INITE Club OAuth2 client registered successfully!');
  console.log('');
  console.log('Client Credentials:');
  console.log('==================');
  console.log('CLIENT_ID:', clientId);
  console.log('CLIENT_SECRET:', clientSecret);
  console.log('');
  console.log('⚠️  ВАЖНО: Сохраните CLIENT_SECRET в безопасном месте!');
  console.log('Добавьте в .env inite-club:');
  console.log('');
  console.log('AUTH_SERVICE_URL=https://auth.inite.ai');
  console.log(`OAUTH_CLIENT_ID=${clientId}`);
  console.log(`OAUTH_CLIENT_SECRET=${clientSecret}`);
  console.log('');
  console.log('Redirect URIs:');
  redirectUris.forEach((uri) => console.log(`  - ${uri}`));

  await prisma.$disconnect();
}

registerIniteClubClient().catch((error) => {
  console.error('Error registering client:', error);
  process.exit(1);
});
