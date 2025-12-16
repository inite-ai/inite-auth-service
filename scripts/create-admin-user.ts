import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as entities from '../src/database/entities';
import * as crypto from 'crypto';

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'inite_auth',
  entities: Object.values(entities),
  synchronize: false,
});

function generateDidKey(): string {
  const { publicKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });

  // Simple base58 encoding
  const publicKeyBase58 = Buffer.from(publicKey).toString('base64url');
  return `did:key:z${publicKeyBase58}`;
}

async function createAdminUser() {
  await dataSource.initialize();
  const userRepo = dataSource.getRepository(entities.User);

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@inite.ai';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const adminName = process.env.ADMIN_NAME || 'Admin';

  // Check if admin already exists
  const existing = await userRepo.findOne({ where: { email: adminEmail } });

  if (existing) {
    console.log('✅ Admin user already exists');
    console.log(`Email: ${adminEmail}`);
    await dataSource.destroy();
    return;
  }

  // Generate DID
  const did = generateDidKey();

  // Hash password
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  // Create admin user
  const admin = userRepo.create({
    did,
    email: adminEmail,
    emailVerified: true,
    name: adminName,
    passwordHash,
    metadata: {
      roles: ['user', 'admin'],
      isAdmin: true,
    },
  });

  await userRepo.save(admin);

  console.log('🎉 Admin user created successfully!');
  console.log('');
  console.log(`Email: ${adminEmail}`);
  console.log(`Password: ${adminPassword}`);
  console.log(`DID: ${did}`);
  console.log('');
  console.log('⚠️  IMPORTANT: Change the admin password after first login!');

  await dataSource.destroy();
}

createAdminUser().catch((error) => {
  console.error('❌ Error creating admin user:', error);
  process.exit(1);
});

