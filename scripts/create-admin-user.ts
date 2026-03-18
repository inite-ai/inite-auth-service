import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

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
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@inite.ai';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const adminName = process.env.ADMIN_NAME || 'Admin';

  // Check if admin already exists
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (existing) {
    console.log('✅ Admin user already exists');
    console.log(`Email: ${adminEmail}`);
    await prisma.$disconnect();
    return;
  }

  // Generate DID
  const did = generateDidKey();

  // Hash password
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  // Create admin user
  await prisma.user.create({
    data: {
      did,
      email: adminEmail,
      emailVerified: true,
      name: adminName,
      passwordHash,
      metadata: {
        roles: ['user', 'admin'],
        isAdmin: true,
      },
    },
  });

  console.log('🎉 Admin user created successfully!');
  console.log('');
  console.log(`Email: ${adminEmail}`);
  console.log(`Password: ${adminPassword}`);
  console.log(`DID: ${did}`);
  console.log('');
  console.log('⚠️  IMPORTANT: Change the admin password after first login!');

  await prisma.$disconnect();
}

createAdminUser().catch((error) => {
  console.error('❌ Error creating admin user:', error);
  process.exit(1);
});
