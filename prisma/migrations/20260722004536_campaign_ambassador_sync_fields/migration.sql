-- AlterEnum
-- Đổi CampaignSource: AMBASSADOR/SCALEF/OTHER -> AMBASSADOR/MANUAL/INTERNAL (chuẩn bị cho module
-- đồng bộ Ambassador). Có dữ liệu thật đang dùng giá trị cũ (từ import log video 2026-07-22) nên
-- KHÔNG dùng USING ép kiểu trực tiếp (sẽ lỗi vì 'OTHER' không còn hợp lệ) — remap tường minh:
--   OTHER      -> INTERNAL  (giữ đúng nghĩa cũ: tag nội bộ như Aff/Booking/Build Kênh)
--   AMBASSADOR -> MANUAL    (campaign nạp tay từ Excel lịch sử, không phải do sync sống tạo ra;
--                             để dành AMBASSADOR cho đúng campaign do module đồng bộ tạo sau này)
--   SCALEF     -> MANUAL    (không có dòng nào đang dùng, remap cho an toàn nếu phát sinh)
BEGIN;
CREATE TYPE "CampaignSource_new" AS ENUM ('AMBASSADOR', 'MANUAL', 'INTERNAL');
ALTER TABLE "public"."campaigns" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "campaigns" ALTER COLUMN "source" TYPE "CampaignSource_new" USING (
  CASE "source"::text
    WHEN 'OTHER' THEN 'INTERNAL'
    WHEN 'AMBASSADOR' THEN 'MANUAL'
    WHEN 'SCALEF' THEN 'MANUAL'
    ELSE "source"::text
  END
)::"CampaignSource_new";
ALTER TYPE "CampaignSource" RENAME TO "CampaignSource_old";
ALTER TYPE "CampaignSource_new" RENAME TO "CampaignSource";
DROP TYPE "public"."CampaignSource_old";
ALTER TABLE "campaigns" ALTER COLUMN "source" SET DEFAULT 'AMBASSADOR';
COMMIT;

-- DropForeignKey
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_mm_id_fkey";

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "cover_url" TEXT,
ADD COLUMN     "desc_html" TEXT,
ADD COLUMN     "internal_deadline" DATE,
ADD COLUMN     "is_urgent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_synced_at" TIMESTAMP(3),
ADD COLUMN     "order_video_count" INTEGER,
ADD COLUMN     "raw" JSONB,
ALTER COLUMN "mm_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "items" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_runs_source_started_at_idx" ON "sync_runs"("source", "started_at");

-- CreateIndex
CREATE INDEX "campaigns_mm_id_idx" ON "campaigns"("mm_id");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_mm_id_fkey" FOREIGN KEY ("mm_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
