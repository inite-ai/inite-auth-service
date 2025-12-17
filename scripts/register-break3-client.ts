import { DataSource } from 'typeorm';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'inite_auth',
  entities: ['src/database/entities/*.entity.ts'],
  synchronize: false,
});

async function registerBreak3Client() {
  await dataSource.initialize();

  const clientId = 'break3';
  const clientSecret = crypto.randomBytes(32).toString('base64url');
  const clientSecretHash = await bcrypt.hash(clientSecret, 10);

  const redirectUris = [
    'http://localhost:5173/callback',
    'http://localhost:5173/silent-callback',
    'https://break3.inite.health/callback',
    'https://break3.inite.health/silent-callback',
  ];

  await dataSource.query(
    `
    INSERT INTO oauth_clients (
      id,
      client_id,
      client_secret_hash,
      name,
      redirect_uris,
      allowed_grants,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      $1,
      $2,
      $3,
      $4,
      $5,
      NOW(),
      NOW()
    )
    ON CONFLICT (client_id) 
    DO UPDATE SET
      client_secret_hash = $2,
      redirect_uris = $4,
      updated_at = NOW()
  `,
    [
      clientId,
      clientSecretHash,
      'Break3 (INITE Health)',
      redirectUris,
      ['authorization_code', 'refresh_token'],
    ],
  );

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

  await dataSource.destroy();
}

registerBreak3Client().catch((error) => {
  console.error('Error registering client:', error);
  process.exit(1);
});

