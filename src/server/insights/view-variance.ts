// So sánh view giả định (avgViewsPerVideo, đang dùng tính lương/thưởng MM ở Module 3) với view
// thật lấy từ scalef_daily_stats (Module 4). Tách khỏi scripts/compare-avg-views.ts (giờ chỉ còn
// là bản in ra console) để dùng chung cho rule VIEW_ASSUMPTION_MISMATCH ở
// src/server/insights/engine.ts — cùng 1 nguồn tính, tránh lệch số giữa report và insight.
//
// Phạm vi: video vừa "đã nộp ScaleF" (scalefSubmittedAt) VỪA "đã khớp" (có scalef_videos liên kết)
// — so đúng tập video có cả 2 phía số liệu, không lẫn video chưa kịp khớp/chưa nộp.
import { prisma } from "@/lib/prisma";

const DEFAULT_AVG_VIEWS_PER_VIDEO = 80_000;

export function monthOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}

// Cùng cách chọn policy hiệu lực như computePayrollDraft (src/server/payroll/compute.ts) — bản mới
// nhất còn hiệu lực tại đầu tháng.
export async function getAvgViewsPerVideo(monthStart: Date): Promise<{ value: number; source: string }> {
  const policy = await prisma.rewardPolicy.findFirst({
    where: {
      appliesTo: "MM",
      name: "campaign_commission",
      effectiveFrom: { lte: monthStart },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: monthStart } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  const params = policy?.params as { avgViewsPerVideo?: number } | undefined;
  if (params?.avgViewsPerVideo) {
    return {
      value: params.avgViewsPerVideo,
      source: `reward_policies (hiệu lực từ ${policy!.effectiveFrom.toISOString().slice(0, 10)})`,
    };
  }
  return { value: DEFAULT_AVG_VIEWS_PER_VIDEO, source: "mặc định cứng — chưa có reward_policies" };
}

export type ViewVarianceGroup = {
  month: string;
  talentId: string;
  talentName: string;
  managerId: string;
  videoCount: number;
  realViews: number;
  assumedViews: number;
  avgViewsPerVideo: number;
  avgSource: string;
};

export async function computeViewVarianceGroups(): Promise<ViewVarianceGroup[]> {
  const videos = await prisma.video.findMany({
    where: { scalefSubmittedAt: { not: null }, scalefVideos: { some: {} } },
    select: {
      id: true,
      airDate: true,
      talentId: true,
      talent: { select: { fullName: true, managerId: true } },
      scalefVideos: { select: { dailyStats: { orderBy: { statDate: "desc" }, take: 1 } } },
    },
    orderBy: { airDate: "asc" },
  });

  type Accum = {
    month: string;
    talentId: string;
    talentName: string;
    managerId: string;
    videoCount: number;
    realViews: number;
  };
  const groups = new Map<string, Accum>();
  for (const v of videos) {
    const month = monthOf(v.airDate);
    const key = `${month}|${v.talentId}`;
    // Video mới nhất mỗi scalef_video (không sum nhiều snapshot — xem cảnh báo trong engine.ts).
    const realViews = v.scalefVideos.reduce((sum, sv) => sum + (sv.dailyStats[0]?.views ?? 0), 0);
    const g = groups.get(key) ?? {
      month,
      talentId: v.talentId,
      talentName: v.talent.fullName,
      managerId: v.talent.managerId,
      videoCount: 0,
      realViews: 0,
    };
    g.videoCount += 1;
    g.realViews += realViews;
    groups.set(key, g);
  }

  const result: ViewVarianceGroup[] = [];
  for (const g of groups.values()) {
    const monthStart = new Date(`${g.month}-01T00:00:00.000Z`);
    const { value: avg, source } = await getAvgViewsPerVideo(monthStart);
    result.push({ ...g, assumedViews: g.videoCount * avg, avgViewsPerVideo: avg, avgSource: source });
  }
  return result.sort((a, b) => a.month.localeCompare(b.month) || a.talentName.localeCompare(b.talentName));
}
