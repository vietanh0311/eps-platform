// Seed reward_policies (nhóm 6) — công thức/tỷ lệ đã xác minh bằng số thật, xem đầy đủ tại
// eps-platform/data/co-che-luong-thuong-mm.md. Idempotent theo (appliesTo, name, effectiveFrom).
// Chạy: npm run db:seed-reward-policies
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// % chi phí max mặc định khi Campaign.costCeilingPct chưa đặt riêng — theo pricePerView (đồng/view).
// Không có tier cho pricePerView < 10: campaign giá thấp hơn 10đ/view bắt buộc CFO đặt
// costCeilingPct riêng trên Campaign, compute.ts không tự suy đoán.
const COST_CEILING_TIERS = [
  { minPricePerView: 10, maxPricePerView: 12, pct: 0.20 },
  { minPricePerView: 13, maxPricePerView: 17, pct: 0.15 },
  { minPricePerView: 18, maxPricePerView: null, pct: 0.12 },
];

const POLICIES: Array<{
  appliesTo: "MM" | "TALENT";
  name: string;
  params: Record<string, unknown>;
  effectiveFrom: string;
  effectiveTo: string | null;
}> = [
  {
    appliesTo: "MM",
    name: "campaign_commission",
    effectiveFrom: "2025-01-01",
    effectiveTo: "2025-06-30",
    params: {
      savingsRate: 0.50,
      profitShareRate: 0.20,
      avgViewsPerVideo: 80000,
      taxRate: 0.90,
      costCeilingTiers: COST_CEILING_TIERS,
    },
  },
  {
    appliesTo: "MM",
    name: "campaign_commission",
    effectiveFrom: "2025-07-01",
    effectiveTo: null,
    params: {
      savingsRate: 0.65,
      profitShareRate: 0.18,
      avgViewsPerVideo: 80000,
      taxRate: 0.90,
      costCeilingTiers: COST_CEILING_TIERS,
    },
  },
  {
    appliesTo: "MM",
    name: "booking_split",
    effectiveFrom: "2025-01-01",
    effectiveTo: null,
    params: { talentShare: 0.25, mmShare: 0.25, companyShare: 0.25, sellerShare: 0.25 },
  },
  {
    appliesTo: "TALENT",
    name: "referral_bonus",
    effectiveFrom: "2025-01-01",
    effectiveTo: null,
    params: {
      milestone1Videos: 10,
      milestone1Amount: 300000,
      milestone2Videos: 40,
      milestone2MinTenureMonths: 2,
      milestone2Amount: 1200000,
    },
  },
  {
    appliesTo: "TALENT",
    name: "top_performer_bonus",
    effectiveFrom: "2025-01-01",
    effectiveTo: null,
    params: {
      ranks: [
        { rank: 1, minVideos: 20, amount: 500000 },
        { rank: 2, minVideos: 15, amount: 300000 },
        { rank: 3, minVideos: 10, amount: 200000 },
      ],
    },
  },
  {
    appliesTo: "TALENT",
    name: "quantity_tier_bonus",
    effectiveFrom: "2025-01-01",
    effectiveTo: null,
    params: {
      tiers: [
        { minVideos: 15, amount: 200000 },
        { minVideos: 20, amount: 300000 },
        { minVideos: 30, amount: 500000 },
      ],
      stacksWithTopPerformer: true,
    },
  },
];

async function main() {
  for (const p of POLICIES) {
    const existing = await prisma.rewardPolicy.findFirst({
      where: { appliesTo: p.appliesTo, name: p.name, effectiveFrom: new Date(p.effectiveFrom) },
    });
    const data = {
      appliesTo: p.appliesTo,
      name: p.name,
      params: p.params as Prisma.InputJsonValue,
      effectiveFrom: new Date(p.effectiveFrom),
      effectiveTo: p.effectiveTo ? new Date(p.effectiveTo) : null,
    };
    if (existing) {
      await prisma.rewardPolicy.update({ where: { id: existing.id }, data });
      console.log(`Cập nhật: ${p.appliesTo}/${p.name} từ ${p.effectiveFrom}`);
    } else {
      await prisma.rewardPolicy.create({ data });
      console.log(`Tạo mới: ${p.appliesTo}/${p.name} từ ${p.effectiveFrom}`);
    }
  }
  console.log("Seed reward_policies xong.");
}

main().finally(() => prisma.$disconnect());
