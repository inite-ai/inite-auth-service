import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddIsAdminColumn1742169600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'isAdmin',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
    );

    // Migrate existing admin users from metadata
    await queryRunner.query(`
      UPDATE users
      SET "isAdmin" = true
      WHERE metadata->>'isAdmin' = 'true'
         OR metadata->'roles' ? 'admin'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'isAdmin');
  }
}
