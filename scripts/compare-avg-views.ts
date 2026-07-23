// In báo cáo đối chiếu view giả định (avgViewsPerVideo, đang dùng tính lương/thưởng MM ở Module 3)
// với view thật lấy từ scalef_daily_stats (Module 4). CHỈ ĐỌC — không ghi reward_policies, không
// đụng payroll. Chạy: npm run scalef:compare-views
//
// Logic tính đã chuyển sang src/server/insights/view-variance.ts (dùng chung với rule
// VIEW_ASSUMPTION_MISMATCH ở src/server/insights/engine.ts) — file này chỉ còn là bản in console.
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { computeViewVarianceGroups } from "../src/server/insights/view-variance";

function fmtInt(n: number): string {
  return n.toLocaleString("vi-VN");
}

function pctDiff(actual: number, expected: number): string {
  if (expected === 0) return actual === 0 ? "0%" : "n/a";
  return `${(((actual - expected) / expected) * 100).toFixed(1)}%`;
}

async function main() {
  const groups = await computeViewVarianceGroups();

  if (groups.length === 0) {
    console.log(
      "Chưa có video nào vừa 'đã nộp ScaleF' vừa 'đã khớp' scalef_videos — chạy `npm run scalef:sync` " +
        "và ghép tay ở /scalef trước khi chạy báo cáo này.",
    );
    return;
  }

  console.log("So sánh view giả định (đang dùng tính lương MM) vs view thật (scalef_daily_stats)\n");
  console.log(
    `${"Tháng".padEnd(9)}${"Talent".padEnd(22)}${"Video".padStart(7)}${"View giả định".padStart(16)}${"View thật".padStart(14)}${"Lệch".padStart(10)}`,
  );
  console.log("-".repeat(80));

  let totalAssumed = 0;
  let totalReal = 0;
  const policyNoteSeen = new Set<string>();
  for (const g of groups) {
    totalAssumed += g.assumedViews;
    totalReal += g.realViews;

    console.log(
      `${g.month.padEnd(9)}${g.talentName.slice(0, 20).padEnd(22)}${String(g.videoCount).padStart(7)}${fmtInt(g.assumedViews).padStart(16)}${fmtInt(g.realViews).padStart(14)}${pctDiff(g.realViews, g.assumedViews).padStart(10)}`,
    );

    const noteKey = `${g.month}|${g.avgViewsPerVideo}`;
    if (!policyNoteSeen.has(noteKey)) {
      policyNoteSeen.add(noteKey);
      console.log(`  (avgViewsPerVideo=${fmtInt(g.avgViewsPerVideo)} — ${g.avgSource})`);
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
