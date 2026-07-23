-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('ADS', 'PRODUCTION', 'SALARY', 'OTHER');

-- CreateEnum
CREATE TYPE "InsightSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" INTEGER NOT NULL,
    "incurred_at" DATE NOT NULL,
    "campaign_id" TEXT,
    "video_id" TEXT,
    "note" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insights" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "InsightSeverity" NOT NULL,
    "visible_to_roles" "Role"[],
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expenses_incurred_at_idx" ON "expenses"("incurred_at");

-- CreateIndex
CREATE INDEX "expenses_campaign_id_idx" ON "expenses"("campaign_id");

-- CreateIndex
CREATE INDEX "expenses_video_id_idx" ON "expenses"("video_id");

-- CreateIndex
CREATE INDEX "insights_type_resolved_at_idx" ON "insights"("type", "resolved_at");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
