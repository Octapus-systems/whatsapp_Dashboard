import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `gen_random_uuid()::varchar` DEFAULT to every `id` column on Postgres.
 *
 * Why this is needed:
 *   The initial schema migration (1770108659848-AddMessageStatus) created the
 *   `id` columns on Postgres as `varchar PRIMARY KEY NOT NULL` without a
 *   DEFAULT. The TypeORM Postgres driver emits `INSERT ... VALUES (DEFAULT, ...)`
 *   for `@PrimaryGeneratedColumn('uuid')` columns and expects the database to
 *   supply the value. Without a column DEFAULT this fails with:
 *     null value in column "id" of relation "<table>" violates not-null constraint
 *
 *   This migration is a no-op on SQLite (TypeORM generates the UUID in the
 *   driver layer there, so no DB default is needed).
 *
 *   `gen_random_uuid()` is built into PostgreSQL 13+ — no extension required.
 */
export class AddUuidDefaultsForPostgres1779235200000 implements MigrationInterface {
  name = 'AddUuidDefaultsForPostgres1779235200000';

  private readonly tables = ['sessions', 'webhooks', 'messages', 'api_keys', 'audit_logs', 'message_batches'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;

    for (const table of this.tables) {
      const exists = await queryRunner.hasTable(table);
      if (!exists) continue;

      // The `id` column may be either `uuid` (when the table was first created
      // by `synchronize`) or `character varying` (when created by the initial
      // migration). Cast the default to match the actual column type so the
      // ALTER succeeds in both cases.
      const rows: Array<{ data_type: string }> = await queryRunner.query(
        `SELECT data_type FROM information_schema.columns WHERE table_name = $1 AND column_name = 'id'`,
        [table],
      );
      const dataType = rows[0]?.data_type;
      if (!dataType) continue;

      const defaultExpr = dataType === 'uuid' ? 'gen_random_uuid()' : 'gen_random_uuid()::varchar';
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "id" SET DEFAULT ${defaultExpr}`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;

    for (const table of this.tables) {
      const exists = await queryRunner.hasTable(table);
      if (!exists) continue;
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "id" DROP DEFAULT`);
    }
  }
}
