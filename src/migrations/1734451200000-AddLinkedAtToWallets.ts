import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddLinkedAtToWallets1734451200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if column already exists
    const table = await queryRunner.getTable('wallets');
    const linkedAtColumn = table?.findColumnByName('linkedAt');

    if (!linkedAtColumn) {
      await queryRunner.addColumn(
        'wallets',
        new TableColumn({
          name: 'linkedAt',
          type: 'timestamp',
          isNullable: true,
          default: 'CURRENT_TIMESTAMP',
        }),
      );
    }

    // Update existing rows to use createdAt value if linkedAt is null
    await queryRunner.query(`
      UPDATE "wallets" 
      SET "linkedAt" = "createdAt" 
      WHERE "linkedAt" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('wallets', 'linkedAt');
  }
}



