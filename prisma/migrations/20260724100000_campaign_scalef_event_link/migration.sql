-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "scalef_event_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_scalef_event_id_key" ON "campaigns"("scalef_event_id");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_scalef_event_id_fkey" FOREIGN KEY ("scalef_event_id") REFERENCES "scalef_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
