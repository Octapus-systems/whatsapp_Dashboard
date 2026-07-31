import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWebhookDeliveries1785495060762 implements MigrationInterface {
  name = 'AddWebhookDeliveries1785495060762';

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

  // ──────────────────────────────────────────────
  //  SQLite
  // ──────────────────────────────────────────────

  private async upSqlite(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "webhook_deliveries" (
        "id" varchar PRIMARY KEY NOT NULL,
        "webhookId" varchar NOT NULL,
        "deliveryId" varchar(64) NOT NULL,
        "event" varchar(128) NOT NULL,
        "statusCode" integer,
        "success" boolean NOT NULL DEFAULT (0),
        "attempt" integer NOT NULL DEFAULT (1),
        "durationMs" integer,
        "requestPayload" text,
        "requestHeaders" text,
        "responsePayload" text,
        "error" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_webhook_deliveries_webhookId" FOREIGN KEY ("webhookId") REFERENCES "webhooks" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_webhook_deliveries_webhookId" ON "webhook_deliveries" ("webhookId")`);
    await queryRunner.query(`CREATE INDEX "IDX_webhook_deliveries_createdAt" ON "webhook_deliveries" ("createdAt")`);
  }

  private async downSqlite(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_webhook_deliveries_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_webhook_deliveries_webhookId"`);
    await queryRunner.query(`DROP TABLE "webhook_deliveries"`);
  }

  // ──────────────────────────────────────────────
  //  PostgreSQL
  // ──────────────────────────────────────────────

  private async upPostgres(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
        "id" varchar PRIMARY KEY NOT NULL DEFAULT gen_random_uuid()::varchar,
        "webhookId" varchar NOT NULL,
        "deliveryId" varchar(64) NOT NULL,
        "event" varchar(128) NOT NULL,
        "statusCode" integer,
        "success" boolean NOT NULL DEFAULT false,
        "attempt" integer NOT NULL DEFAULT 1,
        "durationMs" integer,
        "requestPayload" jsonb,
        "requestHeaders" jsonb,
        "responsePayload" jsonb,
        "error" text,
        "createdAt" timestamp NOT NULL DEFAULT NOW(),
        CONSTRAINT "FK_webhook_deliveries_webhookId" FOREIGN KEY ("webhookId") REFERENCES "webhooks" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_webhook_deliveries_webhookId" ON "webhook_deliveries" ("webhookId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_webhook_deliveries_createdAt" ON "webhook_deliveries" ("createdAt")`);
  }

  private async downPostgres(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_webhook_deliveries_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_webhook_deliveries_webhookId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "webhook_deliveries"`);
  }
}
