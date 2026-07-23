// Số liệu tài chính cho AdminDashboard (Module 6) — doanh thu, chi phí, lợi nhuận, tăng trưởng
// theo tháng, top Talent/campaign. Dùng chung cho Team Finance VÀ Team Tech (system admin ngang
// quyền, xem docs/PROJECT_EPS.md + kế hoạch Module 6).
//
// Nguyên tắc quan trọng: scalef_daily_stats.views/reward_amount là TỔNG LŨY KẾ tại thời điểm scrape
// (không phải delta theo ngày) — luôn lấy dòng statDate mới nhất mỗi ScalefVideo, KHÔNG sum nhiều
// snapshot (xem cùng cảnh báo trong src/server/insights/engine.ts).
import { prisma } from "@/lib/prisma";

// Ngày backfill Talent.productionFeePerVideo — video air TRƯỚC ngày này nhiều khả năng
// production_cost=0 là bình thường (chưa backfill ngược), video air SAU ngày này mà vẫn 0 là lỗ
// hổng nhập liệu thật (xem docs/PROJECT_EPS.md mục Module 3 "Phát hiện quan trọng").
const PRODUCTION_COST_BACKFILL_CUTOFF = new Date("2026-07-22T00:00:00.000Z");
const MONTHS_BACK = 6;

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

function lastNMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    out.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  return out;
}

export type ScalefMatchStatus = {
  matchedCount: number;
  totalCount: number;
  unattributedViews: number;
  unattributedReward: number;
};

// Banner bắt buộc: "có tiền/view thật nhưng chưa ghép được Talent nào" — không bao giờ ẩn số này.
export async function getScalefMatchStatus(): Promise<ScalefMatchStatus> {
  const scalefVideos = await prisma.scalefVideo.findMany({
    select: { videoId: true, dailyStats: { orderBy: { statDate: "desc" }, take: 1, select: { views: true, rewardAmount: true } } },
  });
  let matchedCount = 0;
  let unattributedViews = 0;
  let unattributedReward = 0;
  for (const sv of scalefVideos) {
    const latest = sv.dailyStats[0];
    if (sv.videoId) {
      matchedCount++;
    } else {
      unattributedViews += latest?.views ?? 0;
      unattributedReward += latest?.rewardAmount ?? 0;
    }
  }
  return { matchedCount, totalCount: scalefVideos.length, unattributedViews, unattributedReward };
}

export type ProductionCostStatus = {
  preCutoffTotal: number;
  preCutoffZero: number;
  postCutoffTotal: number;
  postCutoffZero: number;
};

// Banner bắt buộc: phân biệt "chưa backfill ngược" (video cũ, bình thường) vs "lỗ hổng nhập liệu
// thật" (video mới vẫn 0) — xem docs/MODULE_PROMPTS.md mục Module 6.
export async function getProductionCostStatus(): Promise<ProductionCostStatus> {
  const videos = await prisma.video.findMany({ select: { airDate: true, productionCost: true } });
  let preCutoffTotal = 0;
  let preCutoffZero = 0;
  let postCutoffTotal = 0;
  let postCutoffZero = 0;
  for (const v of videos) {
    if (v.airDate < PRODUCTION_COST_BACKFILL_CUTOFF) {
      preCutoffTotal++;
      if (v.productionCost === 0) preCutoffZero++;
    } else {
      postCutoffTotal++;
      if (v.productionCost === 0) postCutoffZero++;
    }
  }
  return { preCutoffTotal, preCutoffZero, postCutoffTotal, postCutoffZero };
}

export type MonthlyFinance = { month: string; revenue: number; cost: number; profit: number };

type MonthBucket = {
  revenueContract: number;
  revenueScalef: number;
  costProduction: number;
  costExpense: number;
  costPayroll: number;
};

async function buildMonthlySeries(months: string[], rangeStart: Date): Promise<MonthlyFinance[]> {
  const buckets = new Map<string, MonthBucket>();
  for (const m of months) buckets.set(m, { revenueContract: 0, revenueScalef: 0, costProduction: 0, costExpense: 0, costPayroll: 0 });

  // Doanh thu booking: contractValue gán trọn vào tháng Campaign.startDate (campaign không có mốc
  // theo tháng riêng — giả định đơn giản nhất, có thể chỉnh nếu CFO có quy tắc khác).
  const campaigns = await prisma.campaign.findMany({
    where: { startDate: { gte: rangeStart } },
    select: { contractValue: true, startDate: true },
  });
  for (const c of campaigns) {
    if (!c.contractValue || !c.startDate) continue;
    const b = buckets.get(monthKey(c.startDate));
    if (b) b.revenueContract += c.contractValue;
  }

  // Doanh thu ScaleF thật — CHỈ video đã ghép Talent (videoId != null), theo statDate của snapshot
  // mới nhất mỗi scalef_video (không sum nhiều snapshot).
  const matchedScalef = await prisma.scalefVideo.findMany({
    where: { videoId: { not: null } },
    select: { dailyStats: { orderBy: { statDate: "desc" }, take: 1, select: { statDate: true, rewardAmount: true } } },
  });
  for (const sv of matchedScalef) {
    const latest = sv.dailyStats[0];
    if (!latest) continue;
    const b = buckets.get(monthKey(latest.statDate));
    if (b) b.revenueScalef += latest.rewardAmount;
  }

  const videos = await prisma.video.findMany({ where: { airDate: { gte: rangeStart } }, select: { airDate: true, productionCost: true } });
  for (const v of videos) {
    const b = buckets.get(monthKey(v.airDate));
    if (b) b.costProduction += v.productionCost;
  }

  // Chi phí ADS/SALARY/OTHER luôn tính; PRODUCTION chỉ tính khi KHÔNG gắn video cụ thể (tránh đếm
  // trùng với Video.productionCost đã cộng ở trên).
  const expenses = await prisma.expense.findMany({
    where: { incurredAt: { gte: rangeStart } },
    select: { incurredAt: true, amount: true, category: true, videoId: true },
  });
  for (const e of expenses) {
    if (e.category === "PRODUCTION" && e.videoId) continue;
    const b = buckets.get(monthKey(e.incurredAt));
    if (b) b.costExpense += e.amount;
  }

  // Chi phí lương: dùng thẳng PayrollItem.total đã tính sẵn ở Module 3, không tính lại công thức.
  const payrollItems = await prisma.payrollItem.findMany({
    where: { period: { month: { in: months } } },
    select: { total: true, period: { select: { month: true } } },
  });
  for (const p of payrollItems) {
    const b = buckets.get(p.period.month);
    if (b) b.costPayroll += p.total;
  }

  return months.map((m) => {
    const b = buckets.get(m)!;
    const revenue = b.revenueContract + b.revenueScalef;
    const cost = b.costProduction + b.costExpense + b.costPayroll;
    return { month: m, revenue, cost, profit: revenue - cost };
  });
}

export type TopEntry = { id: string; name: string; videoCount: number };

async function getTopTalents(rangeStart: Date, limit = 5): Promise<TopEntry[]> {
  const groups = await prisma.video.groupBy({
    by: ["talentId"],
    where: { airDate: { gte: rangeStart } },
    _count: { _all: true },
    orderBy: { _count: { talentId: "desc" } },
    take: limit,
  });
  const talents = await prisma.talent.findMany({ where: { id: { in: groups.map((g) => g.talentId) } }, select: { id: true, fullName: true } });
  const nameById = new Map(talents.map((t) => [t.id, t.fullName]));
  return groups.map((g) => ({ id: g.talentId, name: nameById.get(g.talentId) ?? "—", videoCount: g._count._all }));
}

async function getTopCampaigns(rangeStart: Date, limit = 5): Promise<TopEntry[]> {
  const groups = await prisma.video.groupBy({
    by: ["campaignId"],
    where: { airDate: { gte: rangeStart }, campaignId: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { campaignId: "desc" } },
    take: limit,
  });
  const ids = groups.map((g) => g.campaignId as string);
  const campaigns = await prisma.campaign.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const nameById = new Map(campaigns.map((c) => [c.id, c.name]));
  return groups.map((g) => ({ id: g.campaignId as string, name: nameById.get(g.campaignId as string) ?? "—", videoCount: g._count._all }));
}

export type FinanceOverview = {
  series: MonthlyFinance[];
  totals: { revenue: number; cost: number; profit: number };
  matchStatus: ScalefMatchStatus;
  costStatus: ProductionCostStatus;
  topTalents: TopEntry[];
  topCampaigns: TopEntry[];
};

export async function getFinanceOverview(): Promise<FinanceOverview> {
  const months = lastNMonths(MONTHS_BACK);
  const rangeStart = new Date(`${months[0]}-01T00:00:00.000Z`);

  const [series, matchStatus, costStatus, topTalents, topCampaigns] = await Promise.all([
    buildMonthlySeries(months, rangeStart),
    getScalefMatchStatus(),
    getProductionCostStatus(),
    getTopTalents(rangeStart),
    getTopCampaigns(rangeStart),
  ]);

  const totals = series.reduce(
    (acc, m) => ({ revenue: acc.revenue + m.revenue, cost: acc.cost + m.cost, profit: acc.profit + m.profit }),
    { revenue: 0, cost: 0, profit: 0 },
  );

  return { series, totals, matchStatus, costStatus, topTalents, topCampaigns };
}
