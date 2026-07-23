-- AlterTable
ALTER TABLE "videos" ALTER COLUMN "production_cost" DROP NOT NULL,
ALTER COLUMN "production_cost" DROP DEFAULT;

-- DataMigration: mọi video hiện production_cost=0 nghĩa là "chưa điền" (xác nhận trong
-- docs/PROJECT_EPS.md — 309 video cũ + 8 video mới log tính đến 2026-07-23 đều =0 vì chưa ai
-- điền, không phải video miễn phí thật). Chuyển về NULL để khớp ý nghĩa mới của cột.
UPDATE "videos" SET "production_cost" = NULL WHERE "production_cost" = 0;
