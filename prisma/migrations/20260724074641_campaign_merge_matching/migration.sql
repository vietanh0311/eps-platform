-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "merged_into_id" TEXT;

-- CreateIndex
CREATE INDEX "campaigns_merged_into_id_idx" ON "campaigns"("merged_into_id");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
