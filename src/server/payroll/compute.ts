// Engine tính nháp lương/thưởng (Module 3) — thuần hàm, không đụng DB (ngoại trừ đọc), để
// scripts/reconcile-payroll.ts gọi lại y hệt logic dùng trong app. Công thức đầy đủ + số liệu đã
// xác minh: eps-platform/data/co-che-luong-thuong-mm.md.
//
// Idempotent theo thiết kế: hàm này KHÔNG ghi DB, KHÔNG đánh dấu referralMilestone*PaidAt — việc
// đó chỉ xảy ra khi CFO duyệt kỳ lương (approvePeriod), để recompute nhiều lần lúc còn DRAFT không
// bị lệch (tính lại lần 2 vẫn thấy đủ mốc chưa trả, không bỏ sót).
import { prisma } from "@/lib/prisma";

export type PayrollDraftItem = {
  userId?: string;
  talentId?: string;
  bonusAmount: number;
  breakdown: Record<string, unknown>;
};

export type PayrollDraft = {
  items: PayrollDraftItem[]; // đã gộp theo (userId | talentId) — 1 dòng / người hưởng
  warnings: string[];
};

function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
  return { start, end };
}

type CostCeilingTier = { minPricePerView: number; maxPricePerView: number | null; pct: number };

type CampaignCommissionParams = {
  savingsRate: number;
  profitShareRate: number;
  avgViewsPerVideo: number;
  taxRate: number;
  costCeilingTiers: CostCeilingTier[];
};

type BookingSplitParams = { talentShare: number; mmShare: number; companyShare: number; sellerShare: number };

type ReferralBonusParams = {
  milestone1Videos: number;
  milestone1Amount: number;
  milestone2Videos: number;
  milestone2MinTenureMonths: number;
  milestone2Amount: number;
};

type TopPerformerParams = { ranks: Array<{ rank: number; minVideos: number; amount: number }> };
type QuantityTierParams = { tiers: Array<{ minVideos: number; amount: number }>; stacksWithTopPerformer: boolean };

// Chính sách hiệu lực tại 1 tháng: effectiveFrom <= đầu tháng, effectiveTo null hoặc >= đầu tháng.
// Nhiều bản khớp thì lấy effectiveFrom mới nhất (bản mới nhất còn hiệu lực).
async function getActivePolicy<T>(appliesTo: "MM" | "TALENT", name: string, monthStart: Date): Promise<T | null> {
  const policy = await prisma.rewardPolicy.findFirst({
    where: {
      appliesTo,
      name,
      effectiveFrom: { lte: monthStart },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: monthStart } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  return (policy?.params as T) ?? null;
}

// %chi phí max: ưu tiên Campaign.costCeilingPct (đơn vị % nguyên, vd 18 = 18%), không có thì tra
// tier theo pricePerView. Không khớp tier nào (vd pricePerView < 10) → null, campaign đó bị bỏ qua
// phần commission kèm cảnh báo — không tự suy đoán.
function resolveCostCeilingPct(campaign: { costCeilingPct: number | null; pricePerView: number | null }, tiers: CostCeilingTier[]): number | null {
  if (campaign.costCeilingPct != null) return campaign.costCeilingPct / 100;
  if (campaign.pricePerView == null) return null;
  const tier = tiers.find(
    (t) => campaign.pricePerView! >= t.minPricePerView && (t.maxPricePerView == null || campaign.pricePerView! <= t.maxPricePerView),
  );
  return tier ? tier.pct : null;
}

// ===== A. MM — commission theo campaign (KPI views) =====

async function computeMmCampaignCommission(month: string, warnings: string[]) {
  const { start, end } = monthRange(month);
  const params = await getActivePolicy<CampaignCommissionParams>("MM", "campaign_commission", start);
  if (!params) {
    warnings.push(`Không có reward_policy "campaign_commission" hiệu lực tháng ${month} — bỏ qua toàn bộ commission MM.`);
    return [] as Array<{ userId: string; bonusAmount: number; breakdown: Record<string, unknown> }>;
  }

  const mms = await prisma.user.findMany({ where: { role: "MM" }, select: { id: true, fullName: true } });
  const results: Array<{ userId: string; bonusAmount: number; breakdown: Record<string, unknown> }> = [];

  for (const mm of mms) {
    const groups = await prisma.video.groupBy({
      by: ["campaignId"],
      where: { talent: { managerId: mm.id }, campaignId: { not: null }, airDate: { gte: start, lt: end } },
      _count: { _all: true },
      _sum: { productionCost: true },
    });
    if (groups.length === 0) continue;

    const campaigns = await prisma.campaign.findMany({
      where: { id: { in: groups.map((g) => g.campaignId as string) } },
      select: { id: true, name: true, pricePerView: true, fixedCostPerView: true, costCeilingPct: true },
    });
    const campaignById = new Map(campaigns.map((c) => [c.id, c]));

    const lines: Record<string, unknown>[] = [];
    let mmTotal = 0;

    for (const g of groups) {
      const campaign = campaignById.get(g.campaignId as string);
      const videoCount = g._count._all;
      const productionCost = g._sum.productionCost ?? 0;
      if (!campaign) continue;

      if (campaign.pricePerView == null || campaign.fixedCostPerView == null) {
        warnings.push(`Campaign "${campaign.name}" (MM ${mm.fullName}) chưa có pricePerView/fixedCostPerView — bỏ qua commission, chỉ tính chi phí sản xuất trong log video.`);
        continue;
      }
      const costCeilingPct = resolveCostCeilingPct(campaign, params.costCeilingTiers);
      if (costCeilingPct == null) {
        warnings.push(`Campaign "${campaign.name}" (MM ${mm.fullName}): không tra được %chi phí max (pricePerView=${campaign.pricePerView} không khớp tier nào) — CFO cần đặt costCeilingPct riêng. Bỏ qua commission.`);
        continue;
      }

      const viewsEquivalent = videoCount * params.avgViewsPerVideo;
      const revenue = viewsEquivalent * campaign.pricePerView;
      const revenueAfterTax = Math.round(revenue * params.taxRate);
      const costOnViews = viewsEquivalent * campaign.fixedCostPerView;
      const maxCost = Math.round(revenue * costCeilingPct);
      const savingsBonus = Math.round(params.savingsRate * (maxCost - productionCost));
      const totalCost = costOnViews + productionCost + savingsBonus;
      const profit = revenueAfterTax - totalCost;
      const profitShare = Math.round(params.profitShareRate * profit);
      const campaignTotal = profitShare + savingsBonus;

      lines.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        videoCount,
        avgViewsPerVideo: params.avgViewsPerVideo,
        viewsEquivalent,
        pricePerView: campaign.pricePerView,
        revenue,
        taxRate: params.taxRate,
        revenueAfterTax,
        fixedCostPerView: campaign.fixedCostPerView,
        costOnViews,
        productionCost,
        costCeilingPct,
        maxCost,
        savingsRate: params.savingsRate,
        savingsBonus,
        totalCost,
        profit,
        profitShareRate: params.profitShareRate,
        profitShare,
        campaignTotal,
      });
      mmTotal += campaignTotal;
    }

    if (lines.length > 0) {
      results.push({ userId: mm.id, bonusAmount: mmTotal, breakdown: { campaigns: lines, campaignsTotal: mmTotal } });
    }
  }
  return results;
}

// ===== B. MM — booking (4 bên: mẫu/MM/công ty/người bán) =====

async function computeBooking(month: string, warnings: string[]) {
  const { start } = monthRange(month);
  const params = await getActivePolicy<BookingSplitParams>("MM", "booking_split", start);
  const deals = await prisma.bookingDeal.findMany({ where: { dealMonth: month } });
  if (deals.length === 0) return [] as Array<{ userId: string; bonusAmount: number; breakdown: Record<string, unknown> }>;
  if (!params) {
    warnings.push(`Không có reward_policy "booking_split" hiệu lực tháng ${month} — bỏ qua ${deals.length} booking deal.`);
    return [];
  }

  const byUser = new Map<string, { lines: Record<string, unknown>[]; total: number }>();
  const add = (userId: string, line: Record<string, unknown>, amount: number) => {
    const entry = byUser.get(userId) ?? { lines: [], total: 0 };
    entry.lines.push(line);
    entry.total += amount;
    byUser.set(userId, entry);
  };

  for (const deal of deals) {
    const mmAmount = Math.round(deal.castAmount * params.mmShare);
    const sellerAmount = Math.round(deal.castAmount * params.sellerShare);
    add(deal.mmId, { dealId: deal.id, brandName: deal.brandName, castAmount: deal.castAmount, role: "mm", share: params.mmShare, amount: mmAmount }, mmAmount);
    add(deal.sellerId, { dealId: deal.id, brandName: deal.brandName, castAmount: deal.castAmount, role: "seller", share: params.sellerShare, amount: sellerAmount }, sellerAmount);
    // Phần "mẫu 25%"/"công ty 25%" không tạo payroll_item (ngoài phạm vi Module 3) — chỉ tham
    // khảo, CFO đối chiếu qua booking deal gốc + %talentShare/companyShare trong policy.
  }

  return Array.from(byUser.entries()).map(([userId, v]) => ({
    userId,
    bonusAmount: v.total,
    breakdown: { bookingDeals: v.lines, bookingTotal: v.total },
  }));
}

// ===== C. Talent — thưởng Top + thưởng số lượng (theo video campaign trong tháng) =====

async function computeTalentMonthlyBonuses(month: string, warnings: string[]) {
  const { start, end } = monthRange(month);
  const topParams = await getActivePolicy<TopPerformerParams>("TALENT", "top_performer_bonus", start);
  const qtyParams = await getActivePolicy<QuantityTierParams>("TALENT", "quantity_tier_bonus", start);
  if (!topParams && !qtyParams) {
    warnings.push(`Không có reward_policy Top/số lượng cho TALENT hiệu lực tháng ${month}.`);
    return [] as Array<{ talentId: string; bonusAmount: number; breakdown: Record<string, unknown> }>;
  }

  const counts = await prisma.video.groupBy({
    by: ["talentId"],
    where: { campaignId: { not: null }, airDate: { gte: start, lt: end } },
    _count: { _all: true },
  });
  if (counts.length === 0) return [];

  // Dense rank theo số video giảm dần — nhiều Talent cùng số video thì cùng hạng, hạng kế tiếp
  // là giá trị PHÂN BIỆT tiếp theo (không nhảy cóc theo số người tại hạng trên).
  const distinctCounts = Array.from(new Set(counts.map((c) => c._count._all))).sort((a, b) => b - a);
  const rankOf = (n: number) => distinctCounts.indexOf(n) + 1;

  const results: Array<{ talentId: string; bonusAmount: number; breakdown: Record<string, unknown> }> = [];
  for (const c of counts) {
    const talentId = c.talentId!;
    const videoCount = c._count._all;
    let topPerformer: Record<string, unknown> | null = null;
    let quantityTier: Record<string, unknown> | null = null;
    let total = 0;

    if (topParams) {
      const rank = rankOf(videoCount);
      const rankDef = topParams.ranks.find((r) => r.rank === rank);
      // Phải đạt CẢ thứ hạng lẫn ngưỡng — không đạt ngưỡng thì hạng đó bỏ trống, không đẩy hạng dưới lên.
      // Ngưỡng Top dùng ">" (chính sách gốc ghi ">20/>15/>10 video"), khác quantityTier dùng ">="
      // ("đạt mốc 15/20/30 video") — cả 2 đúng theo nguyên văn chính sách CFO cung cấp, không phải lỗi.
      if (rankDef && videoCount > rankDef.minVideos) {
        topPerformer = { rank, minVideos: rankDef.minVideos, amount: rankDef.amount };
        total += rankDef.amount;
      }
    }
    if (qtyParams) {
      // Chọn mốc cao nhất đạt được, không cộng dồn giữa các mốc.
      const tier = [...qtyParams.tiers].sort((a, b) => b.minVideos - a.minVideos).find((t) => videoCount >= t.minVideos);
      if (tier) {
        quantityTier = { minVideos: tier.minVideos, amount: tier.amount };
        total += tier.amount;
      }
    }

    if (total > 0) {
      results.push({
        talentId,
        bonusAmount: total,
        breakdown: { videoCount, topPerformer, quantityTier, monthlyBonusTotal: total },
      });
    }
  }
  return results;
}

// ===== D. Thưởng tuyển dụng (referral) — 1 lần/mốc, trả cho người giới thiệu =====

async function computeReferralBonuses(month: string, warnings: string[]) {
  const { end } = monthRange(month);
  const params = await getActivePolicy<ReferralBonusParams>("TALENT", "referral_bonus", end);
  if (!params) {
    warnings.push(`Không có reward_policy "referral_bonus" hiệu lực tháng ${month} — bỏ qua thưởng tuyển dụng.`);
    return [] as Array<{ userId: string; bonusAmount: number; breakdown: Record<string, unknown> }>;
  }

  const referred = await prisma.talent.findMany({
    where: {
      referredById: { not: null },
      OR: [{ referralMilestone1PaidAt: null }, { referralMilestone2PaidAt: null }],
    },
    select: {
      id: true,
      fullName: true,
      referredById: true,
      joinedAt: true,
      referralMilestone1PaidAt: true,
      referralMilestone2PaidAt: true,
    },
  });
  if (referred.length === 0) return [];

  const byReferrer = new Map<string, { lines: Record<string, unknown>[]; total: number }>();
  const add = (userId: string, line: Record<string, unknown>, amount: number) => {
    const entry = byReferrer.get(userId) ?? { lines: [], total: 0 };
    entry.lines.push(line);
    entry.total += amount;
    byReferrer.set(userId, entry);
  };

  for (const t of referred) {
    // Đếm video campaign LŨY KẾ từ trước tới cuối tháng đang tính (mốc 1 lần, không giới hạn tháng).
    const lifetimeVideoCount = await prisma.video.count({
      where: { talentId: t.id, campaignId: { not: null }, airDate: { lt: end } },
    });

    if (!t.referralMilestone1PaidAt && lifetimeVideoCount >= params.milestone1Videos) {
      add(
        t.referredById!,
        { talentId: t.id, talentName: t.fullName, milestone: 1, videoCountAtCheck: lifetimeVideoCount, amount: params.milestone1Amount },
        params.milestone1Amount,
      );
    }

    const tenureMonths = t.joinedAt ? (end.getTime() - t.joinedAt.getTime()) / (1000 * 60 * 60 * 24 * 30) : 0;
    if (!t.referralMilestone2PaidAt && lifetimeVideoCount >= params.milestone2Videos && tenureMonths > params.milestone2MinTenureMonths) {
      add(
        t.referredById!,
        { talentId: t.id, talentName: t.fullName, milestone: 2, videoCountAtCheck: lifetimeVideoCount, tenureMonths: Math.floor(tenureMonths), amount: params.milestone2Amount },
        params.milestone2Amount,
      );
    }
  }

  return Array.from(byReferrer.entries()).map(([userId, v]) => ({
    userId,
    bonusAmount: v.total,
    breakdown: { referrals: v.lines, referralsTotal: v.total },
  }));
}

// ===== Gộp tất cả nguồn thành payroll_items (1 dòng / người hưởng) =====

export async function computePayrollDraft(month: string): Promise<PayrollDraft> {
  const warnings: string[] = [];
  const [commission, booking, talentBonuses, referrals] = await Promise.all([
    computeMmCampaignCommission(month, warnings),
    computeBooking(month, warnings),
    computeTalentMonthlyBonuses(month, warnings),
    computeReferralBonuses(month, warnings),
  ]);

  const byUser = new Map<string, PayrollDraftItem>();
  const mergeUser = (userId: string, bonusAmount: number, breakdown: Record<string, unknown>) => {
    const existing = byUser.get(userId);
    if (existing) {
      existing.bonusAmount += bonusAmount;
      Object.assign(existing.breakdown, breakdown);
    } else {
      byUser.set(userId, { userId, bonusAmount, breakdown: { ...breakdown } });
    }
  };
  for (const c of commission) mergeUser(c.userId, c.bonusAmount, c.breakdown);
  for (const b of booking) mergeUser(b.userId, b.bonusAmount, b.breakdown);
  for (const r of referrals) mergeUser(r.userId, r.bonusAmount, r.breakdown);

  const byTalent = new Map<string, PayrollDraftItem>();
  for (const t of talentBonuses) byTalent.set(t.talentId, { talentId: t.talentId, bonusAmount: t.bonusAmount, breakdown: t.breakdown });

  return { items: [...byUser.values(), ...byTalent.values()], warnings };
}
