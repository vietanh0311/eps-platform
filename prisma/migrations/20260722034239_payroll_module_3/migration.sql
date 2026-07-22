-- CreateEnum
CREATE TYPE "RewardApplyTo" AS ENUM ('MM', 'TALENT');

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID');

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "cost_ceiling_pct" INTEGER,
ADD COLUMN     "fixed_cost_per_view" INTEGER,
ADD COLUMN     "price_per_view" INTEGER;

-- AlterTable
ALTER TABLE "talents" ADD COLUMN     "referral_milestone1_paid_at" TIMESTAMP(3),
ADD COLUMN     "referral_milestone2_paid_at" TIMESTAMP(3),
ADD COLUMN     "referred_by_id" TEXT;

-- CreateTable
CREATE TABLE "reward_policies" (
    "id" TEXT NOT NULL,
    "applies_to" "RewardApplyTo" NOT NULL,
    "name" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_items" (
    "id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "user_id" TEXT,
    "talent_id" TEXT,
    "base_amount" INTEGER NOT NULL DEFAULT 0,
    "bonus_amount" INTEGER NOT NULL DEFAULT 0,
    "breakdown" JSONB NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_deals" (
    "id" TEXT NOT NULL,
    "mm_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "talent_id" TEXT,
    "brand_name" TEXT NOT NULL,
    "cast_amount" INTEGER NOT NULL,
    "deal_month" TEXT NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_deals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reward_policies_applies_to_name_effective_from_idx" ON "reward_policies"("applies_to", "name", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_month_key" ON "payroll_periods"("month");

-- CreateIndex
CREATE INDEX "payroll_items_period_id_idx" ON "payroll_items"("period_id");

-- CreateIndex
CREATE INDEX "payroll_items_user_id_idx" ON "payroll_items"("user_id");

-- CreateIndex
CREATE INDEX "payroll_items_talent_id_idx" ON "payroll_items"("talent_id");

-- CreateIndex
CREATE INDEX "booking_deals_deal_month_idx" ON "booking_deals"("deal_month");

-- CreateIndex
CREATE INDEX "booking_deals_mm_id_idx" ON "booking_deals"("mm_id");

-- AddForeignKey
ALTER TABLE "talents" ADD CONSTRAINT "talents_referred_by_id_fkey" FOREIGN KEY ("referred_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_talent_id_fkey" FOREIGN KEY ("talent_id") REFERENCES "talents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_deals" ADD CONSTRAINT "booking_deals_mm_id_fkey" FOREIGN KEY ("mm_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_deals" ADD CONSTRAINT "booking_deals_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_deals" ADD CONSTRAINT "booking_deals_talent_id_fkey" FOREIGN KEY ("talent_id") REFERENCES "talents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_deals" ADD CONSTRAINT "booking_deals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
