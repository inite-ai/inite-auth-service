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

  const columns = [
    { name: 'redirectUris', defaultVal: null },
    { name: 'allowedScopes', defaultVal: "'{}'::text[]" },
    { name: 'allowedGrants', defaultVal: "'{authorization_code,refresh_token}'::text[]" },
  ];

  for (const col of columns) {
    const { rows } = await client.query(`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'oauth_clients' AND column_name = $1
    `, [col.name]);

    if (rows.length === 0) {
      console.log(`Column ${col.name} not found, skipping`);
      continue;
    }

    if (rows[0].data_type === 'ARRAY') {
      console.log(`Column ${col.name} is already an array, skipping`);
      continue;
    }

    console.log(`Converting ${col.name} from ${rows[0].data_type} to text[]...`);

    // Drop default first, then convert type, then set new default
    await client.query(`ALTER TABLE "oauth_clients" ALTER COLUMN "${col.name}" DROP DEFAULT`);
    // Normalize data: wrap bare comma-separated values in {} before casting
    await client.query(`
      UPDATE "oauth_clients"
      SET "${col.name}" = '{' || "${col.name}" || '}'
      WHERE "${col.name}" IS NOT NULL AND "${col.name}" NOT LIKE '{%'
    `);
    await client.query(`ALTER TABLE "oauth_clients" ALTER COLUMN "${col.name}" TYPE text[] USING "${col.name}"::text[]`);
    if (col.defaultVal) {
      await client.query(`ALTER TABLE "oauth_clients" ALTER COLUMN "${col.name}" SET DEFAULT ${col.defaultVal}`);
    }

    console.log(`Converted ${col.name} to text[]`);
  }

  await client.end();
  console.log('Array migration complete');
}

main().catch(e => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
