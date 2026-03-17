import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * This migration was originally adding an isAdmin column,
 * but that approach was reverted in favor of using metadata JSONB.
 * Now it drops the column if it exists (cleanup from failed deploy).
 */
export class AddIsAdminColumn1742169600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the column if it was created by a previous deploy
    const table = await queryRunner.getTable('users');
    if (table?.columns.find((c) => c.name === 'isAdmin')) {
      await queryRunner.dropColumn('users', 'isAdmin');
    }
  }

  public async down(): Promise<void> {
    // No-op: we don't want to re-add the column
  }
}
