import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPasskeyDeviceFields1734451300000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('passkeys');

    // Add deviceType column if it doesn't exist
    const deviceTypeColumn = table?.findColumnByName('deviceType');
    if (!deviceTypeColumn) {
      await queryRunner.addColumn(
        'passkeys',
        new TableColumn({
          name: 'deviceType',
          type: 'varchar',
          isNullable: true,
        }),
      );
    }

    // Add deviceName column if it doesn't exist
    const deviceNameColumn = table?.findColumnByName('deviceName');
    if (!deviceNameColumn) {
      await queryRunner.addColumn(
        'passkeys',
        new TableColumn({
          name: 'deviceName',
          type: 'varchar',
          isNullable: true,
        }),
      );
    }

    // Add lastUsedAt column if it doesn't exist
    const lastUsedAtColumn = table?.findColumnByName('lastUsedAt');
    if (!lastUsedAtColumn) {
      await queryRunner.addColumn(
        'passkeys',
        new TableColumn({
          name: 'lastUsedAt',
          type: 'timestamp',
          isNullable: true,
          default: 'CURRENT_TIMESTAMP',
        }),
      );
    }

    // Update existing passkeys to set lastUsedAt from createdAt
    await queryRunner.query(`
      UPDATE "passkeys" 
      SET "lastUsedAt" = "createdAt" 
      WHERE "lastUsedAt" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('passkeys', 'lastUsedAt');
    await queryRunner.dropColumn('passkeys', 'deviceName');
    await queryRunner.dropColumn('passkeys', 'deviceType');
  }
}


