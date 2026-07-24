-- CreateTable
CREATE TABLE "campaign_managers" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_managers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_managers_user_id_idx" ON "campaign_managers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_managers_campaign_id_user_id_key" ON "campaign_managers"("campaign_id", "user_id");

-- AddForeignKey
ALTER TABLE "campaign_managers" ADD CONSTRAINT "campaign_managers_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_managers" ADD CONSTRAINT "campaign_managers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DataMigration: Vấn đề 2 — chuyển toàn bộ campaigns.mm_id thật (13 dòng tại thời điểm viết
-- migration) sang campaign_managers trước khi xóa cột, không mất dữ liệu MM đã đứng tên.
INSERT INTO "campaign_managers" ("id", "campaign_id", "user_id", "assigned_at")
SELECT gen_random_uuid()::text, "id", "mm_id", "created_at"
FROM "campaigns"
WHERE "mm_id" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_mm_id_fkey";

-- DropIndex
DROP INDEX "campaigns_mm_id_idx";

-- AlterTable
ALTER TABLE "campaigns" DROP COLUMN "mm_id";
