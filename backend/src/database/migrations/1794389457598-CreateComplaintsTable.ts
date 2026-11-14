import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateComplaintsTable1794389457598 implements MigrationInterface {
  name = 'CreateComplaintsTable1794389457598';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "complaints" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "category" character varying(50) NOT NULL, "subject" character varying(200) NOT NULL, "message" text NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'OPEN', "adminResponse" text, "handledById" uuid, "resolvedAt" TIMESTAMP, CONSTRAINT "PK_complaints" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_complaints_userId" ON "complaints" ("userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "complaints" ADD CONSTRAINT "FK_complaints_userId" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "complaints" ADD CONSTRAINT "FK_complaints_handledById" FOREIGN KEY ("handledById") REFERENCES "users" ("id") ON DELETE SET NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "complaints" DROP CONSTRAINT "FK_complaints_handledById"`);
    await queryRunner.query(`ALTER TABLE "complaints" DROP CONSTRAINT "FK_complaints_userId"`);
    await queryRunner.query(`DROP INDEX "IDX_complaints_userId"`);
    await queryRunner.query(`DROP TABLE "complaints"`);
  }
}
