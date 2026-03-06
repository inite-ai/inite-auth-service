import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class AddUserKnownDevices1738680000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user_known_devices',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'fingerprint',
            type: 'character varying',
            isNullable: false,
          },
          {
            name: 'firstSeenAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'user_known_devices',
      new TableIndex({
        name: 'UQ_user_known_devices_userId_fingerprint',
        columnNames: ['userId', 'fingerprint'],
        isUnique: true,
      }),
    );

    await queryRunner.createForeignKey(
      'user_known_devices',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('user_known_devices');
    const fk = table?.foreignKeys.find((f) => f.columnNames.indexOf('userId') !== -1);
    if (fk) {
      await queryRunner.dropForeignKey('user_known_devices', fk);
    }
    await queryRunner.dropIndex('user_known_devices', 'UQ_user_known_devices_userId_fingerprint');
    await queryRunner.dropTable('user_known_devices');
  }
}
