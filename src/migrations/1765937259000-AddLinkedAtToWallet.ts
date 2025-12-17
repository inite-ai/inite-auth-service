import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddLinkedAtToWallet1765937259000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if column exists before adding
    const table = await queryRunner.getTable('wallet');
    const column = table?.findColumnByName('linkedAt');
    
    if (!column) {
      await queryRunner.addColumn(
        'wallet',
        new TableColumn({
          name: 'linkedAt',
          type: 'timestamp',
          default: 'now()',
          isNullable: false,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('wallet', 'linkedAt');
  }
}
