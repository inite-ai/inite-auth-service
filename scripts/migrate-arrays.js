/**
 * One-time migration: convert text columns to text[] in oauth_clients.
 * Safe to run multiple times — checks column type before altering.
 */
const { Client } = require('pg');

const url = process.env.DATABASE_URL ||
  `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'inite_auth'}`;

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();

  const columns = ['redirectUris', 'allowedScopes', 'allowedGrants'];

  for (const col of columns) {
    // Check if column is already text[]
    const { rows } = await client.query(`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'oauth_clients' AND column_name = $1
    `, [col]);

    if (rows.length === 0) {
      console.log(`Column ${col} not found, skipping`);
      continue;
    }

    if (rows[0].data_type === 'ARRAY') {
      console.log(`Column ${col} is already an array, skipping`);
      continue;
    }

    console.log(`Converting ${col} from ${rows[0].data_type} to text[]...`);
    await client.query(`ALTER TABLE "oauth_clients" ALTER COLUMN "${col}" TYPE text[] USING "${col}"::text[]`);
    console.log(`Converted ${col} to text[]`);
  }

  await client.end();
  console.log('Array migration complete');
}

main().catch(e => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
