// Vấn đề 3 (2026-07-24) — phát hiện cặp Campaign MANUAL (điền tay, nhóm thô theo brand, xem
// docs/DB_SCHEMA.md nhóm 3) và AMBASSADOR (auto-sync) nghi ngờ trùng nhau. CHỈ GỢI Ý — không tự
// khớp/gộp: đã chứng minh bằng dữ liệu thật (2026-07-22) là khớp mờ theo tên brand có thể sai (1
// brand có thể có nhiều đợt Ambassador chạy song song, ví dụ Katinat có 3 đợt). CFO/Tech tự xem
// và quyết định Bỏ qua/Gộp ở /campaigns/matching (src/server/actions/campaigns.ts).
import { prisma } from "@/lib/prisma";
import { isMonthLocked, monthKeyOf } from "@/server/payroll/compute";

export type MatchCandidate = {
  manual: {
    id: string;
    name: string;
    brandName: string;
    managerNames: string[]; // Vấn đề 2 — campaign hỗ trợ nhiều MM, rỗng = chưa ai nhận
    videoCount: number;
    assignmentCount: number;
    lockedMonths: string[]; // tháng lương APPROVED/PAID có video của campaign này — cảnh báo khi gộp
  };
  ambassador: {
    id: string;
    name: string;
    brandName: string;
    managerNames: string[];
    status: string;
    hasRewardTerms: boolean;
  };
};

// Export để tái dùng ở src/server/campaigns/scalef-policy.ts (Vấn đề 1 — khớp Campaign.brandName
// với ScalefEvent.raw.partner.name, cùng bản chất "1 brand nhiều đợt" như ở đây).
export function brandsOverlap(a: string, b: string): boolean {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

export async function findMatchCandidates(): Promise<MatchCandidate[]> {
  const [manualCampaigns, ambassadorCampaigns, dismissed] = await Promise.all([
    prisma.campaign.findMany({
      where: { source: "MANUAL", mergedIntoId: null },
      include: {
        managers: { include: { user: { select: { fullName: true } } } },
        _count: { select: { videos: true, assignments: true } },
        videos: { select: { airDate: true } },
      },
    }),
    prisma.campaign.findMany({
      where: { source: "AMBASSADOR", mergedIntoId: null },
      include: { managers: { include: { user: { select: { fullName: true } } } } },
    }),
    prisma.auditLog.findMany({
      where: { action: "DISMISS", entity: "campaign_match" },
      select: { entityId: true },
    }),
  ]);
  const dismissedKeys = new Set(dismissed.map((d) => d.entityId));

  // Tháng lương đã khóa (APPROVED/PAID) — dùng để cảnh báo khi gộp đụng dữ liệu lương đã chốt.
  const allMonths = new Set<string>();
  for (const m of manualCampaigns) for (const v of m.videos) allMonths.add(monthKeyOf(v.airDate));
  const lockedByMonth = new Map<string, boolean>();
  await Promise.all(
    [...allMonths].map(async (month) => lockedByMonth.set(month, await isMonthLocked(month))),
  );

  const results: MatchCandidate[] = [];
  for (const m of manualCampaigns) {
    const lockedMonths = [
      ...new Set(m.videos.map((v) => monthKeyOf(v.airDate)).filter((month) => lockedByMonth.get(month))),
    ].sort();

    for (const a of ambassadorCampaigns) {
      if (!brandsOverlap(m.brandName, a.brandName)) continue;
      if (dismissedKeys.has(`${m.id}:${a.id}`)) continue;
      results.push({
        manual: {
          id: m.id,
          name: m.name,
          brandName: m.brandName,
          managerNames: m.managers.map((mgr) => mgr.user.fullName),
          videoCount: m._count.videos,
          assignmentCount: m._count.assignments,
          lockedMonths,
        },
        ambassador: {
          id: a.id,
          name: a.name,
          brandName: a.brandName,
          managerNames: a.managers.map((mgr) => mgr.user.fullName),
          status: a.status,
          hasRewardTerms: a.pricePerView != null,
        },
      });
    }
  }
  return results;
}
