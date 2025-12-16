import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserProfileFields1734365000000 implements MigrationInterface {
  name = 'AddUserProfileFields1734365000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add missing user profile fields
    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD COLUMN "bio" character varying,
      ADD COLUMN "location" character varying,
      ADD COLUMN "profession" character varying,
      ADD COLUMN "twoFactorSecret" character varying,
      ADD COLUMN "twoFactorEnabled" boolean NOT NULL DEFAULT false,
      ADD COLUMN "emailVerificationToken" character varying,
      ADD COLUMN "emailVerificationExpires" TIMESTAMP,
      ADD COLUMN "passwordResetToken" character varying,
      ADD COLUMN "passwordResetExpires" TIMESTAMP,
      ADD COLUMN "passwordHash" character varying
    `);

    // Create indexes for token lookups
    await queryRunner.query(`
      CREATE INDEX "IDX_users_emailVerificationToken" 
      ON "users" ("emailVerificationToken")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_users_passwordResetToken" 
      ON "users" ("passwordResetToken")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX "IDX_users_passwordResetToken"`);
    await queryRunner.query(`DROP INDEX "IDX_users_emailVerificationToken"`);

    // Drop columns
    await queryRunner.query(`
      ALTER TABLE "users" 
      DROP COLUMN "passwordHash",
      DROP COLUMN "passwordResetExpires",
      DROP COLUMN "passwordResetToken",
      DROP COLUMN "emailVerificationExpires",
      DROP COLUMN "emailVerificationToken",
      DROP COLUMN "twoFactorEnabled",
      DROP COLUMN "twoFactorSecret",
      DROP COLUMN "profession",
      DROP COLUMN "location",
      DROP COLUMN "bio"
    `);
  }
}

