-- CreateEnum
CREATE TYPE "CampaignSource" AS ENUM ('AMBASSADOR', 'SCALEF', 'OTHER');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('NEW', 'RUNNING', 'DONE');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'NEEDS_FIX');

-- CreateEnum
CREATE TYPE "PipelineStatus" AS ENUM ('NOT_IN_PIPELINE', 'RECEIVED', 'ADS_DONE', 'ENGAGEMENT_DONE', 'SENT_SCALEF');

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand_name" TEXT NOT NULL,
    "source" "CampaignSource" NOT NULL DEFAULT 'AMBASSADOR',
    "brief" TEXT,
    "contract_value" INTEGER,
    "mm_id" TEXT NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "status" "CampaignStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "source_url" TEXT,
    "external_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_assignments" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "talent_id" TEXT NOT NULL,
    "assigned_by" TEXT NOT NULL,
    "deadline" DATE,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "talent_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "air_date" DATE NOT NULL,
    "platform" "Platform" NOT NULL,
    "video_url" TEXT NOT NULL,
    "air_clip_code" TEXT,
    "brief_comment" TEXT,
    "feedback" TEXT,
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "pipeline_status" "PipelineStatus" NOT NULL DEFAULT 'NOT_IN_PIPELINE',
    "production_cost" INTEGER NOT NULL DEFAULT 0,
    "logged_by" TEXT NOT NULL,
    "scalef_submitted_by" TEXT,
    "scalef_submitted_at" TIMESTAMP(3),
    "scalef_confirmed_by" TEXT,
    "scalef_confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_pipeline_events" (
    "id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "from_status" "PipelineStatus" NOT NULL,
    "to_status" "PipelineStatus" NOT NULL,
    "by_user" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "video_pipeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_external_key_key" ON "campaigns"("external_key");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_assignments_campaign_id_talent_id_key" ON "campaign_assignments"("campaign_id", "talent_id");

-- CreateIndex
CREATE INDEX "videos_air_date_idx" ON "videos"("air_date");

-- CreateIndex
CREATE INDEX "videos_talent_id_idx" ON "videos"("talent_id");

-- CreateIndex
CREATE INDEX "videos_video_url_idx" ON "videos"("video_url");

-- CreateIndex
CREATE INDEX "video_pipeline_events_video_id_idx" ON "video_pipeline_events"("video_id");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_mm_id_fkey" FOREIGN KEY ("mm_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_assignments" ADD CONSTRAINT "campaign_assignments_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_assignments" ADD CONSTRAINT "campaign_assignments_talent_id_fkey" FOREIGN KEY ("talent_id") REFERENCES "talents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_assignments" ADD CONSTRAINT "campaign_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_talent_id_fkey" FOREIGN KEY ("talent_id") REFERENCES "talents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_logged_by_fkey" FOREIGN KEY ("logged_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_scalef_submitted_by_fkey" FOREIGN KEY ("scalef_submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_scalef_confirmed_by_fkey" FOREIGN KEY ("scalef_confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_pipeline_events" ADD CONSTRAINT "video_pipeline_events_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_pipeline_events" ADD CONSTRAINT "video_pipeline_events_by_user_fkey" FOREIGN KEY ("by_user") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
