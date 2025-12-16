import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1734364800000 implements MigrationInterface {
  name = 'InitialSchema1734364800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "did" character varying NOT NULL,
        "email" character varying,
        "emailVerified" boolean NOT NULL DEFAULT false,
        "name" character varying,
        "avatarUrl" character varying,
        "bio" character varying,
        "location" character varying,
        "profession" character varying,
        "passwordHash" character varying,
        "twoFactorSecret" character varying,
        "twoFactorEnabled" boolean NOT NULL DEFAULT false,
        "emailVerificationToken" character varying,
        "emailVerificationExpires" TIMESTAMP,
        "passwordResetToken" character varying,
        "passwordResetExpires" TIMESTAMP,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_did" UNIQUE ("did"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id")
      )
    `);

    // Create passkeys table
    await queryRunner.query(`
      CREATE TABLE "passkeys" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "credentialId" character varying NOT NULL,
        "publicKey" text NOT NULL,
        "counter" bigint NOT NULL DEFAULT '0',
        "transports" text,
        "name" character varying,
        "userId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_passkeys_credentialId" UNIQUE ("credentialId"),
        CONSTRAINT "PK_passkeys_id" PRIMARY KEY ("id")
      )
    `);

    // Create wallets table
    await queryRunner.query(`
      CREATE TABLE "wallets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "address" character varying NOT NULL,
        "chain" character varying NOT NULL,
        "signature" text NOT NULL,
        "message" text NOT NULL,
        "isPrimary" boolean NOT NULL DEFAULT false,
        "userId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_wallets_address_chain" UNIQUE ("address", "chain"),
        CONSTRAINT "PK_wallets_id" PRIMARY KEY ("id")
      )
    `);

    // Create oauth_clients table
    await queryRunner.query(`
      CREATE TABLE "oauth_clients" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "clientId" character varying NOT NULL,
        "clientSecretHash" character varying NOT NULL,
        "name" character varying NOT NULL,
        "redirectUris" text NOT NULL,
        "allowedScopes" text NOT NULL DEFAULT 'openid,profile,email',
        "allowedGrants" text NOT NULL DEFAULT 'authorization_code,refresh_token',
        "active" boolean NOT NULL DEFAULT true,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_oauth_clients_clientId" UNIQUE ("clientId"),
        CONSTRAINT "PK_oauth_clients_id" PRIMARY KEY ("id")
      )
    `);

    // Create authorization_codes table
    await queryRunner.query(`
      CREATE TABLE "authorization_codes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying NOT NULL,
        "clientId" character varying NOT NULL,
        "userId" uuid NOT NULL,
        "redirectUri" character varying NOT NULL,
        "scope" character varying NOT NULL,
        "codeChallenge" character varying,
        "codeChallengeMethod" character varying,
        "expiresAt" TIMESTAMP NOT NULL,
        "used" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_authorization_codes_code" UNIQUE ("code"),
        CONSTRAINT "PK_authorization_codes_id" PRIMARY KEY ("id")
      )
    `);

    // Create refresh_tokens table
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "token" character varying NOT NULL,
        "userId" uuid NOT NULL,
        "clientId" character varying NOT NULL,
        "scope" character varying NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "revoked" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "revokedAt" TIMESTAMP,
        CONSTRAINT "UQ_refresh_tokens_token" UNIQUE ("token"),
        CONSTRAINT "PK_refresh_tokens_id" PRIMARY KEY ("id")
      )
    `);

    // Create magic_links table
    await queryRunner.query(`
      CREATE TABLE "magic_links" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "token" character varying NOT NULL,
        "email" character varying NOT NULL,
        "userId" uuid,
        "expiresAt" TIMESTAMP NOT NULL,
        "used" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_magic_links_token" UNIQUE ("token"),
        CONSTRAINT "PK_magic_links_id" PRIMARY KEY ("id")
      )
    `);

    // Add foreign keys
    await queryRunner.query(`
      ALTER TABLE "passkeys" 
      ADD CONSTRAINT "FK_passkeys_userId" 
      FOREIGN KEY ("userId") 
      REFERENCES "users"("id") 
      ON DELETE CASCADE 
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "wallets" 
      ADD CONSTRAINT "FK_wallets_userId" 
      FOREIGN KEY ("userId") 
      REFERENCES "users"("id") 
      ON DELETE CASCADE 
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "authorization_codes" 
      ADD CONSTRAINT "FK_authorization_codes_userId" 
      FOREIGN KEY ("userId") 
      REFERENCES "users"("id") 
      ON DELETE CASCADE 
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "refresh_tokens" 
      ADD CONSTRAINT "FK_refresh_tokens_userId" 
      FOREIGN KEY ("userId") 
      REFERENCES "users"("id") 
      ON DELETE CASCADE 
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "magic_links" 
      ADD CONSTRAINT "FK_magic_links_userId" 
      FOREIGN KEY ("userId") 
      REFERENCES "users"("id") 
      ON DELETE CASCADE 
      ON UPDATE NO ACTION
    `);

    // Create indexes
    await queryRunner.query(`CREATE INDEX "IDX_users_email" ON "users" ("email")`);
    await queryRunner.query(`CREATE INDEX "IDX_users_did" ON "users" ("did")`);
    await queryRunner.query(`CREATE INDEX "IDX_users_emailVerificationToken" ON "users" ("emailVerificationToken")`);
    await queryRunner.query(`CREATE INDEX "IDX_users_passwordResetToken" ON "users" ("passwordResetToken")`);
    await queryRunner.query(`CREATE INDEX "IDX_passkeys_userId" ON "passkeys" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_wallets_userId" ON "wallets" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_wallets_address" ON "wallets" ("address")`);
    await queryRunner.query(`CREATE INDEX "IDX_oauth_clients_clientId" ON "oauth_clients" ("clientId")`);
    await queryRunner.query(`CREATE INDEX "IDX_authorization_codes_code" ON "authorization_codes" ("code")`);
    await queryRunner.query(`CREATE INDEX "IDX_authorization_codes_userId" ON "authorization_codes" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_token" ON "refresh_tokens" ("token")`);
    await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_userId" ON "refresh_tokens" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_magic_links_token" ON "magic_links" ("token")`);
    await queryRunner.query(`CREATE INDEX "IDX_magic_links_email" ON "magic_links" ("email")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX "IDX_magic_links_email"`);
    await queryRunner.query(`DROP INDEX "IDX_magic_links_token"`);
    await queryRunner.query(`DROP INDEX "IDX_refresh_tokens_userId"`);
    await queryRunner.query(`DROP INDEX "IDX_refresh_tokens_token"`);
    await queryRunner.query(`DROP INDEX "IDX_authorization_codes_userId"`);
    await queryRunner.query(`DROP INDEX "IDX_authorization_codes_code"`);
    await queryRunner.query(`DROP INDEX "IDX_oauth_clients_clientId"`);
    await queryRunner.query(`DROP INDEX "IDX_wallets_address"`);
    await queryRunner.query(`DROP INDEX "IDX_wallets_userId"`);
    await queryRunner.query(`DROP INDEX "IDX_passkeys_userId"`);
    await queryRunner.query(`DROP INDEX "IDX_users_passwordResetToken"`);
    await queryRunner.query(`DROP INDEX "IDX_users_emailVerificationToken"`);
    await queryRunner.query(`DROP INDEX "IDX_users_did"`);
    await queryRunner.query(`DROP INDEX "IDX_users_email"`);

    // Drop foreign keys
    await queryRunner.query(`ALTER TABLE "magic_links" DROP CONSTRAINT "FK_magic_links_userId"`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_refresh_tokens_userId"`);
    await queryRunner.query(`ALTER TABLE "authorization_codes" DROP CONSTRAINT "FK_authorization_codes_userId"`);
    await queryRunner.query(`ALTER TABLE "wallets" DROP CONSTRAINT "FK_wallets_userId"`);
    await queryRunner.query(`ALTER TABLE "passkeys" DROP CONSTRAINT "FK_passkeys_userId"`);

    // Drop tables
    await queryRunner.query(`DROP TABLE "magic_links"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE "authorization_codes"`);
    await queryRunner.query(`DROP TABLE "oauth_clients"`);
    await queryRunner.query(`DROP TABLE "wallets"`);
    await queryRunner.query(`DROP TABLE "passkeys"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}

