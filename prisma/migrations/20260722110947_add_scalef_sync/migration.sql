-- CreateEnum
CREATE TYPE "ScrapeRunStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "scalef_videos" (
    "id" TEXT NOT NULL,
    "video_id" TEXT,
    "scalef_key" TEXT NOT NULL,
    "scalef_url" TEXT NOT NULL,
    "approved_on_scalef" BOOLEAN NOT NULL DEFAULT false,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scalef_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scalef_daily_stats" (
    "id" TEXT NOT NULL,
    "scalef_video_id" TEXT NOT NULL,
    "stat_date" DATE NOT NULL,
    "views" INTEGER NOT NULL,
    "reward_amount" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scalef_daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrape_runs" (
    "id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,
    "status" "ScrapeRunStatus" NOT NULL,
    "items_found" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,

    CONSTRAINT "scrape_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scalef_events" (
    "id" TEXT NOT NULL,
    "scalef_event_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "raw" JSONB,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scalef_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scalef_videos_scalef_key_key" ON "scalef_videos"("scalef_key");

-- CreateIndex
CREATE INDEX "scalef_videos_video_id_idx" ON "scalef_videos"("video_id");

-- CreateIndex
CREATE UNIQUE INDEX "scalef_daily_stats_scalef_video_id_stat_date_key" ON "scalef_daily_stats"("scalef_video_id", "stat_date");

-- CreateIndex
CREATE INDEX "scrape_runs_started_at_idx" ON "scrape_runs"("started_at");

-- CreateIndex
CREATE UNIQUE INDEX "scalef_events_scalef_event_id_key" ON "scalef_events"("scalef_event_id");

-- AddForeignKey
ALTER TABLE "scalef_videos" ADD CONSTRAINT "scalef_videos_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scalef_daily_stats" ADD CONSTRAINT "scalef_daily_stats_scalef_video_id_fkey" FOREIGN KEY ("scalef_video_id") REFERENCES "scalef_videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
