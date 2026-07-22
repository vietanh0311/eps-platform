-- CreateTable
CREATE TABLE "affiliate_links" (
    "id" TEXT NOT NULL,
    "talent_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "target_url" TEXT NOT NULL DEFAULT 'https://dealverse.pages.dev',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link_clicks" (
    "id" TEXT NOT NULL,
    "link_id" TEXT NOT NULL,
    "clicked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referrer" TEXT,
    "source" TEXT,
    "user_agent" TEXT,
    "ip_hash" TEXT,

    CONSTRAINT "link_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link_conversions" (
    "id" TEXT NOT NULL,
    "link_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "value" INTEGER,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_links_slug_key" ON "affiliate_links"("slug");

-- CreateIndex
CREATE INDEX "affiliate_links_talent_id_idx" ON "affiliate_links"("talent_id");

-- CreateIndex
CREATE INDEX "link_clicks_link_id_clicked_at_idx" ON "link_clicks"("link_id", "clicked_at");

-- CreateIndex
CREATE INDEX "link_conversions_link_id_idx" ON "link_conversions"("link_id");

-- AddForeignKey
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_talent_id_fkey" FOREIGN KEY ("talent_id") REFERENCES "talents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link_clicks" ADD CONSTRAINT "link_clicks_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "affiliate_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link_conversions" ADD CONSTRAINT "link_conversions_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "affiliate_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
