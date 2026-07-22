// Đối chiếu view giả định (avgViewsPerVideo, đang dùng tính lương/thưởng MM ở Module 3) với view
// thật lấy từ scalef_daily_stats (Module 4). CHỈ ĐỌC — không ghi reward_policies, không đụng
// payroll. Chạy: npm run scalef:compare-views
//
// Phạm vi so sánh: video vừa "đã nộp ScaleF" (scalefSubmittedAt) VỪA "đã khớp" (có scalef_videos
// liên kết) — so đúng tập video có cả 2 phía số liệu, không lẫn video chưa kịp khớp/chưa nộp.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const DEFAULT_AVG_VIEWS_PER_VIDEO = 80_000;

function monthOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function fmtInt(n: number): string {
  return n.toLocaleString("vi-VN");
}

function pctDiff(actual: number, expected: number): string {
  if (expected === 0) return actual === 0 ? "0%" : "n/a";
  return `${(((actual - expected) / expected) * 100).toFixed(1)}%`;
}

// Cùng cách chọn policy hiệu lực như computePayrollDraft (src/server/payroll/compute.ts) — bản mới
// nhất còn hiệu lực tại đầu tháng. Không export dùng chung vì đây là script đọc riêng, tách khỏi
// engine tính lương thật để không vô tình phụ thuộc lẫn nhau.
async function getAvgViewsPerVideo(monthStart: Date): Promise<{ value: number; source: string }> {
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

type Group = {
  month: string;
  talentId: string;
  talentName: string;
  videoCount: number;
  realViews: number;
};

async function main() {
  const videos = await prisma.video.findMany({
    where: { scalefSubmittedAt: { not: null }, scalefVideos: { some: {} } },
    select: {
      id: true,
      airDate: true,
      talentId: true,
      talent: { select: { fullName: true } },
      scalefVideos: { select: { dailyStats: { orderBy: { statDate: "desc" }, take: 1 } } },
    },
    orderBy: { airDate: "asc" },
  });

  if (videos.length === 0) {
    console.log(
      "Chưa có video nào vừa 'đã nộp ScaleF' vừa 'đã khớp' scalef_videos — chạy `npm run scalef:sync` " +
        "và ghép tay ở /scalef trước khi chạy báo cáo này.",
    );
    return;
  }

  const groups = new Map<string, Group>();
  for (const v of videos) {
    const month = monthOf(v.airDate);
    const key = `${month}|${v.talentId}`;
    const realViews = v.scalefVideos.reduce((sum, sv) => sum + (sv.dailyStats[0]?.views ?? 0), 0);
    const g = groups.get(key) ?? {
      month,
      talentId: v.talentId,
      talentName: v.talent.fullName,
      videoCount: 0,
      realViews: 0,
    };
    g.videoCount += 1;
    g.realViews += realViews;
    groups.set(key, g);
  }

  const sorted = [...groups.values()].sort(
    (a, b) => a.month.localeCompare(b.month) || a.talentName.localeCompare(b.talentName),
  );

  console.log("So sánh view giả định (đang dùng tính lương MM) vs view thật (scalef_daily_stats)\n");
  console.log(
    `${"Tháng".padEnd(9)}${"Talent".padEnd(22)}${"Video".padStart(7)}${"View giả định".padStart(16)}${"View thật".padStart(14)}${"Lệch".padStart(10)}`,
  );
  console.log("-".repeat(80));

  let totalAssumed = 0;
  let totalReal = 0;
  const policyNoteSeen = new Set<string>();
  for (const g of sorted) {
    const monthStart = new Date(`${g.month}-01T00:00:00.000Z`);
    const { value: avg, source } = await getAvgViewsPerVideo(monthStart);
    const assumedViews = g.videoCount * avg;
    totalAssumed += assumedViews;
    totalReal += g.realViews;

    console.log(
      `${g.month.padEnd(9)}${g.talentName.slice(0, 20).padEnd(22)}${String(g.videoCount).padStart(7)}${fmtInt(assumedViews).padStart(16)}${fmtInt(g.realViews).padStart(14)}${pctDiff(g.realViews, assumedViews).padStart(10)}`,
    );

    const noteKey = `${g.month}|${avg}`;
    if (!policyNoteSeen.has(noteKey)) {
      policyNoteSeen.add(noteKey);
      console.log(`  (avgViewsPerVideo=${fmtInt(avg)} — ${source})`);
    }
  }

  console.log("-".repeat(80));
  console.log(
    `${"TỔNG".padEnd(9)}${"".padEnd(22)}${"".padStart(7)}${fmtInt(totalAssumed).padStart(16)}${fmtInt(totalReal).padStart(14)}${pctDiff(totalReal, totalAssumed).padStart(10)}`,
  );

  console.log(
    "\n(Chỉ đọc — không ghi reward_policies, không đụng payroll. View thật lấy từ dòng " +
      "scalef_daily_stats mới nhất của từng video đã khớp, không phải trung bình cộng — video có ít " +
      "snapshot [mới nộp ScaleF] sẽ cho view thấp hơn thực tế đến khi sync đủ ngày.)",
  );
}

main().finally(() => prisma.$disconnect());
