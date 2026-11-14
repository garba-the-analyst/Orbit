import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateErrorLogsTable1794389457599 implements MigrationInterface {
  name = 'CreateErrorLogsTable1794389457599';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "error_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "path" character varying(200) NOT NULL, "method" character varying(10) NOT NULL, "message" text NOT NULL, "stack" text, "userId" uuid, "role" character varying(20), "userAgent" character varying(200), "reviewed" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_error_logs" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_error_logs_userId" ON "error_logs" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_error_logs_createdAt" ON "error_logs" ("createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "error_logs" ADD CONSTRAINT "FK_error_logs_userId" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "error_logs" DROP CONSTRAINT "FK_error_logs_userId"`);
    await queryRunner.query(`DROP INDEX "IDX_error_logs_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_error_logs_userId"`);
    await queryRunner.query(`DROP TABLE "error_logs"`);
  }
}
