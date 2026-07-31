import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the broadcast_jobs table backing the broadcast / scheduled bulk send feature.
 * Mirrors the message_batches table shape (see 1770108659848-AddMessageStatus.ts) but
 * stores a single message + recipient list + optional scheduledAt/bullJobId.
 */
export class AddBroadcastJobs1785700000000 implements MigrationInterface {
  name = 'AddBroadcastJobs1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    if (isPostgres) {
      await this.upPostgres(queryRunner);
    } else {
      await this.upSqlite(queryRunner);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    if (isPostgres) {
      await this.downPostgres(queryRunner);
    } else {
      await this.downSqlite(queryRunner);
    }
  }

  private async upSqlite(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "broadcast_jobs" (` +
        `"id" varchar PRIMARY KEY NOT NULL, ` +
        `"broadcast_id" varchar NOT NULL, ` +
        `"session_id" varchar NOT NULL, ` +
        `"message" text NOT NULL, ` +
        `"recipients" text NOT NULL, ` +
        `"status" varchar NOT NULL DEFAULT ('pending'), ` +
        `"scheduled_at" text, ` +
        `"bull_job_id" varchar, ` +
        `"options" text, ` +
        `"progress" text, ` +
        `"results" text, ` +
        `"current_index" integer NOT NULL DEFAULT (0), ` +
        `"created_at" datetime NOT NULL DEFAULT (datetime('now')), ` +
        `"updated_at" datetime NOT NULL DEFAULT (datetime('now')), ` +
        `"started_at" datetime, ` +
        `"completed_at" datetime, ` +
        `CONSTRAINT "UQ_broadcast_jobs_broadcast_id" UNIQUE ("broadcast_id"))`,
    );
  }

  private async downSqlite(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "broadcast_jobs"`);
  }

  private async upPostgres(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "broadcast_jobs" (` +
        `"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), ` +
        `"broadcast_id" varchar NOT NULL, ` +
        `"session_id" varchar NOT NULL, ` +
        `"message" text NOT NULL, ` +
        `"recipients" jsonb NOT NULL, ` +
        `"status" varchar NOT NULL DEFAULT 'pending', ` +
        `"scheduled_at" timestamp, ` +
        `"bull_job_id" varchar, ` +
        `"options" jsonb, ` +
        `"progress" jsonb, ` +
        `"results" jsonb, ` +
        `"current_index" integer NOT NULL DEFAULT 0, ` +
        `"created_at" timestamp NOT NULL DEFAULT NOW(), ` +
        `"updated_at" timestamp NOT NULL DEFAULT NOW(), ` +
        `"started_at" timestamp, ` +
        `"completed_at" timestamp, ` +
        `CONSTRAINT "UQ_broadcast_jobs_broadcast_id" UNIQUE ("broadcast_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_broadcast_jobs_session_id" ON "broadcast_jobs" ("session_id")`,
    );
  }

  private async downPostgres(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "broadcast_jobs"`);
  }
}
