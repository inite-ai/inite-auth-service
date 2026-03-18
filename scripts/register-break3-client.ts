import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function registerBreak3Client() {
  const clientId = 'break3';
  const clientSecret = crypto.randomBytes(32).toString('base64url');
  const clientSecretHash = await bcrypt.hash(clientSecret, 10);

  const redirectUris = [
    'http://localhost:5173/callback',
    'http://localhost:5173/silent-callback',
    'https://break3.inite.health/callback',
    'https://break3.inite.health/silent-callback',
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
    console.log('✅ Break3 OAuth2 client configuration updated (secret unchanged)');
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
      name: 'Break3 (INITE Health)',
      redirectUris,
      allowedGrants: ['authorization_code', 'refresh_token'],
    },
  });

  console.log('✅ Break3 OAuth2 client registered successfully!');
  console.log('');
  console.log('Client Credentials:');
  console.log('==================');
  console.log('CLIENT_ID:', clientId);
  console.log('CLIENT_SECRET:', clientSecret);
  console.log('');
  console.log('⚠️  ВАЖНО: Сохраните CLIENT_SECRET в безопасном месте!');
  console.log('Добавьте в .env break3:');
  console.log('');
  console.log('REACT_APP_AUTH_SERVICE_URL=https://auth.inite.ai');
  console.log(`REACT_APP_OAUTH_CLIENT_ID=${clientId}`);
  console.log(`REACT_APP_OAUTH_CLIENT_SECRET=${clientSecret}`);
  console.log('');
  console.log('Redirect URIs:');
  redirectUris.forEach((uri) => console.log(`  - ${uri}`));
  console.log('');
  console.log('⚠️  Не забудьте добавить в CORS_ORIGINS:');
  console.log('CORS_ORIGINS=https://break3.inite.health,http://localhost:5173,...');

  await prisma.$disconnect();
}

registerBreak3Client().catch((error) => {
  console.error('Error registering client:', error);
  process.exit(1);
});
