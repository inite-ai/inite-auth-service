/**
 * Provision the OAuth clients for the inite-brain-service vertical.
 *
 * Two clients:
 *
 *   - `brain-landing` — the brain dashboard (Next.js BFF). Authorization
 *     code + PKCE for user login, refresh_token for rotation, and RFC 8693
 *     token-exchange so the BFF can trade the user's session token for an
 *     `aud=brain` token when proxying to the brain backend (instead of
 *     minting an anonymous M2M token that loses the user identity).
 *
 *   - `brain-service` — brain's own M2M identity (client_credentials) for
 *     background jobs and service-to-service calls where no user exists.
 *
 * Usage:
 *   BRAIN_LANDING_CLIENT_SECRET=<32+ bytes> \
 *   BRAIN_SERVICE_CLIENT_SECRET=<32+ bytes> \
 *   BRAIN_LANDING_REDIRECT_URIS=https://brain.inite.ai/api/auth/callback \
 *     npx ts-node scripts/register-brain-clients.ts
 *
 * Secrets are printed once on first run. After that the script never
 * touches secrets — rotate via the admin panel. Re-running refreshes
 * non-secret fields (scopes, grants, audiences, redirect URIs).
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { BRAIN_SCOPES, STANDARD_SCOPES } from '../src/oauth/oauth-scopes.registry';

const prisma = new PrismaClient();

const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange';

const landingRedirectUris = (
  process.env.BRAIN_LANDING_REDIRECT_URIS ??
  'https://brain.inite.ai/api/auth/callback,http://localhost:3000/api/auth/callback'
)
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);

interface BrainClientConfig {
  clientId: string;
  clientSecret: string;
  name: string;
  redirectUris: string[];
  allowedScopes: string[];
  allowedGrants: string[];
  allowedAudiences: string[];
  secretEnvVar: string;
}

const CLIENTS: BrainClientConfig[] = [
  {
    clientId: 'brain-landing',
    clientSecret:
      process.env.BRAIN_LANDING_CLIENT_SECRET ?? crypto.randomBytes(32).toString('hex'),
    name: 'INITE Brain Dashboard',
    redirectUris: landingRedirectUris,
    // User-delegated surface: standard OIDC + the brain scopes a session
    // may carry. registry:publish / indexer:write are machine-only and
    // deliberately absent — they belong to brain-service.
    allowedScopes: [
      ...STANDARD_SCOPES,
      'brain:read',
      'brain:write',
      'brain:admin',
      'brain:read_pii',
    ],
    allowedGrants: ['authorization_code', 'refresh_token', TOKEN_EXCHANGE_GRANT],
    allowedAudiences: ['brain', 'brain-landing'],
    secretEnvVar: 'BRAIN_LANDING_CLIENT_SECRET',
  },
  {
    clientId: 'brain-service',
    clientSecret:
      process.env.BRAIN_SERVICE_CLIENT_SECRET ?? crypto.randomBytes(32).toString('hex'),
    name: 'INITE Brain Service (M2M)',
    redirectUris: [], // M2M only — no user redirect
    allowedScopes: [...BRAIN_SCOPES],
    allowedGrants: ['client_credentials'],
    allowedAudiences: ['brain'],
    secretEnvVar: 'BRAIN_SERVICE_CLIENT_SECRET',
  },
];

async function upsertClient(config: BrainClientConfig): Promise<void> {
  const existing = await prisma.oAuthClient.findUnique({
    where: { clientId: config.clientId },
  });

  if (existing) {
    console.log(`✅ Client '${config.name}' already exists.`);
    console.log('   Updating non-secret fields (scopes, grants, audiences, redirects)...');
    await prisma.oAuthClient.update({
      where: { clientId: config.clientId },
      data: {
        name: config.name,
        redirectUris: config.redirectUris,
        allowedScopes: config.allowedScopes,
        allowedGrants: config.allowedGrants,
        allowedAudiences: config.allowedAudiences,
        active: true,
      },
    });
    console.log('   ✅ Configuration updated (secret untouched).');
    console.log('   To rotate the secret: /admin → OAuth Clients → ' + config.clientId + ' → Rotate secret\n');
    return;
  }

  const clientSecretHash = await bcrypt.hash(config.clientSecret, 10);
  await prisma.oAuthClient.create({
    data: {
      clientId: config.clientId,
      clientSecretHash,
      name: config.name,
      redirectUris: config.redirectUris,
      allowedScopes: config.allowedScopes,
      allowedGrants: config.allowedGrants,
      allowedAudiences: config.allowedAudiences,
      active: true,
    },
  });

  console.log(`✅ Registered: ${config.name}`);
  console.log(`   Client ID:      ${config.clientId}`);
  console.log(`   Client Secret:  ${config.clientSecret}`);
  console.log(`   Allowed Scopes: ${config.allowedScopes.join(', ')}`);
  console.log(`   Grants:         ${config.allowedGrants.join(', ')}`);
  console.log(`   Audiences:      ${config.allowedAudiences.join(', ')}`);
  console.log(`📌 Save the secret NOW — it cannot be retrieved later (${config.secretEnvVar}).\n`);
}

async function main() {
  console.log('🧠 Registering inite-brain-service OAuth clients...\n');
  for (const config of CLIENTS) {
    await upsertClient(config);
  }
  console.log('Set in the brain repo:');
  console.log('  brain-landing/.env:  OAUTH_CLIENT_ID=brain-landing');
  console.log('                       OAUTH_CLIENT_SECRET=<BRAIN_LANDING_CLIENT_SECRET>');
  console.log('  brain .env:          AUTH_SERVICE_JWKS_URL=<issuer>/.well-known/jwks.json');
  console.log('                       AUTH_SERVICE_ISSUER=<issuer>');
  console.log('                       AUTH_SERVICE_AUDIENCE=brain');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
