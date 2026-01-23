import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMagicLinkMissingFields1737592800000 implements MigrationInterface {
  name = 'AddMagicLinkMissingFields1737592800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add purpose column to magic_links table
    await queryRunner.query(`
      ALTER TABLE "magic_links" 
      ADD COLUMN IF NOT EXISTS "purpose" character varying NOT NULL DEFAULT 'login'
    `);

    // Add usedAt column to magic_links table
    await queryRunner.query(`
      ALTER TABLE "magic_links" 
      ADD COLUMN IF NOT EXISTS "usedAt" TIMESTAMP
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "magic_links" DROP COLUMN IF EXISTS "usedAt"`);
    await queryRunner.query(`ALTER TABLE "magic_links" DROP COLUMN IF EXISTS "purpose"`);
  }
}
