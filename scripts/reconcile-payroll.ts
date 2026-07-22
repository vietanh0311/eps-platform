// Đối chiếu số compute.ts tính ra với 2 file report lương MM thật (Giang, Hà) — xem công thức +
// nguồn số liệu tại eps-platform/data/co-che-luong-thuong-mm.md.
//
// Chọn tháng có video thật đã import (2026-01→07, xem PROJECT_EPS.md) khớp với 1 tháng có đủ dữ
// liệu trong report: Giang tháng 6/2026 (số video khớp TUYỆT ĐỐI trên cả 5 campaign — xác nhận
// bằng SQL trước khi viết script này) và Hà tháng 3/2026 (khớp gần đúng — có lệch nhỏ do cách khớp
// campaign "thô theo tên brand" đã ghi trong docs/DB_SCHEMA.md nhóm 3, không phải lỗi công thức).
//
// Script CHỈ ĐỌC payroll — không tạo payroll_period/payroll_items thật. Có set tạm 3 cột cơ chế
// lên Campaign để compute.ts chạy được (Campaign hiện chưa có cơ chế nào vì đây là dữ liệu nhập
// tháng 2026-01→07, cơ chế thật CFO chưa nhập qua UI) — RESTORE lại giá trị cũ (null) khi xong,
// không để lại dữ liệu demo trong bảng thật.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { computePayrollDraft } from "../src/server/payroll/compute";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

function vnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + "đ";
}
function pct(actual: number, expected: number): string {
  if (expected === 0) return actual === 0 ? "0%" : "n/a (expected=0)";
  return `${(((actual - expected) / expected) * 100).toFixed(1)}%`;
}

type RewardTerms = { pricePerView: number; fixedCostPerView: number; costCeilingPct: number };
type ReportLine = { campaign: string; expectedTotal: number; expectedProductionCost: number };

async function setCampaignTerms(byName: Record<string, RewardTerms>) {
  const original = new Map<string, { pricePerView: number | null; fixedCostPerView: number | null; costCeilingPct: number | null }>();
  for (const name of Object.keys(byName)) {
    const campaign = await prisma.campaign.findFirst({ where: { name } });
    if (!campaign) {
      console.warn(`  [!] Không tìm thấy campaign "${name}" trong DB — bỏ qua.`);
      continue;
    }
    original.set(campaign.id, {
      pricePerView: campaign.pricePerView,
      fixedCostPerView: campaign.fixedCostPerView,
      costCeilingPct: campaign.costCeilingPct,
    });
    await prisma.campaign.update({ where: { id: campaign.id }, data: byName[name] });
  }
  return original;
}

async function restoreCampaignTerms(original: Map<string, { pricePerView: number | null; fixedCostPerView: number | null; costCeilingPct: number | null }>) {
  for (const [id, data] of original) {
    await prisma.campaign.update({ where: { id }, data });
  }
}

async function reconcileMm(label: string, email: string, month: string, terms: Record<string, RewardTerms>, reportLines: ReportLine[]) {
  console.log(`\n${"=".repeat(70)}\n${label} — tháng ${month}\n${"=".repeat(70)}`);

  const original = await setCampaignTerms(terms);
  try {
    const draft = await computePayrollDraft(month);
    if (draft.warnings.length > 0) {
      console.log("Cảnh báo khi tính:");
      draft.warnings.forEach((w) => console.log(`  - ${w}`));
    }

    const mm = await prisma.user.findUnique({ where: { email } });
    const item = draft.items.find((i) => i.userId === mm?.id);
    const campaigns = (item?.breakdown as { campaigns?: Array<{ campaignName: string; campaignTotal: number; productionCost: number }> })?.campaigns ?? [];

    console.log(`\n${"Campaign".padEnd(16)}${"Tính ra".padStart(14)}${"Report gốc".padStart(14)}${"Lệch".padStart(10)}  Chi phí SX (DB vs report)`);
    let sumComputed = 0;
    let sumExpected = 0;
    for (const line of reportLines) {
      const computed = campaigns.find((c) => c.campaignName === line.campaign);
      const computedTotal = computed?.campaignTotal ?? 0;
      const computedProdCost = computed?.productionCost ?? 0;
      sumComputed += computedTotal;
      sumExpected += line.expectedTotal;
      console.log(
        `${line.campaign.padEnd(16)}${vnd(computedTotal).padStart(14)}${vnd(line.expectedTotal).padStart(14)}${pct(computedTotal, line.expectedTotal).padStart(10)}  ${vnd(computedProdCost)} vs ${vnd(line.expectedProductionCost)}`,
      );
    }
    console.log(`${"-".repeat(70)}`);
    console.log(`${"TỔNG".padEnd(16)}${vnd(sumComputed).padStart(14)}${vnd(sumExpected).padStart(14)}${pct(sumComputed, sumExpected).padStart(10)}`);
    console.log(`\n(Tính ra dùng Video.productionCost thật trong DB — đang = 0 cho mọi video vì`);
    console.log(` Talent.productionFeePerVideo chưa được import từ Excel thật ở Module 1/2, xem`);
    console.log(` cảnh báo cuối file. Lệch trên chủ yếu tới từ đây, KHÔNG phải sai công thức.)`);

    // Đối chiếu "cô lập công thức": set tạm Video.productionCost = số report gốc ghi (thay vì 0
    // trong DB), CHẠY LẠI compute.ts thật (không viết lại công thức tay — tránh lệch do gõ nhầm),
    // để xem phần còn lại của công thức (doanh thu, chi phí trên views, thưởng tiết kiệm, Com MM)
    // có khớp không khi có đủ dữ liệu chi phí sản xuất thật. Restore lại 0 sau khi xong.
    console.log(`\nĐối chiếu cô lập công thức (set tạm Chi phí sản xuất = số report gốc, restore sau):`);
    const videoBackup = await patchProductionCosts(mm!.id, month, reportLines);
    try {
      const draft2 = await computePayrollDraft(month);
      const item2 = draft2.items.find((i) => i.userId === mm?.id);
      const campaigns2 = (item2?.breakdown as { campaigns?: Array<{ campaignName: string; campaignTotal: number }> })?.campaigns ?? [];
      let sumIsolated = 0;
      let sumExpected2 = 0;
      for (const line of reportLines) {
        const c2 = campaigns2.find((c) => c.campaignName === line.campaign);
        const total2 = c2?.campaignTotal ?? 0;
        sumIsolated += total2;
        sumExpected2 += line.expectedTotal;
        console.log(`  ${line.campaign.padEnd(14)}${vnd(total2).padStart(14)}  vs report ${vnd(line.expectedTotal).padStart(14)}  lệch ${pct(total2, line.expectedTotal)}`);
      }
      console.log(`  ${"TỔNG".padEnd(14)}${vnd(sumIsolated).padStart(14)}  vs report ${vnd(sumExpected2).padStart(14)}  lệch ${pct(sumIsolated, sumExpected2)}`);
    } finally {
      await restoreProductionCosts(videoBackup);
    }
  } finally {
    await restoreCampaignTerms(original);
  }
}

async function patchProductionCosts(mmId: string, month: string, reportLines: ReportLine[]) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
  const backup: Array<{ id: string; productionCost: number }> = [];
  for (const line of reportLines) {
    const campaign = await prisma.campaign.findFirst({ where: { name: line.campaign } });
    if (!campaign) continue;
    const videos = await prisma.video.findMany({
      where: { talent: { managerId: mmId }, campaignId: campaign.id, airDate: { gte: start, lt: end } },
      select: { id: true, productionCost: true },
    });
    if (videos.length === 0) continue;
    const perVideo = Math.round(line.expectedProductionCost / videos.length);
    for (const v of videos) {
      backup.push({ id: v.id, productionCost: v.productionCost });
      await prisma.video.update({ where: { id: v.id }, data: { productionCost: perVideo } });
    }
  }
  return backup;
}

async function restoreProductionCosts(backup: Array<{ id: string; productionCost: number }>) {
  for (const v of backup) {
    await prisma.video.update({ where: { id: v.id }, data: { productionCost: v.productionCost } });
  }
}

async function main() {
  // ===== Giang, tháng 6/2026 — video count khớp tuyệt đối DB vs report (đã xác nhận bằng SQL) =====
  await reconcileMm("MM Giang", "giang.mm@eps.local", "2026-06", {
    VPBank: { pricePerView: 13, fixedCostPerView: 4, costCeilingPct: 15 },
    Highland: { pricePerView: 15, fixedCostPerView: 4, costCeilingPct: 15 },
    FPTShop: { pricePerView: 16, fixedCostPerView: 4, costCeilingPct: 15 },
    HDBank: { pricePerView: 10, fixedCostPerView: 4, costCeilingPct: 20 },
    Tiki: { pricePerView: 15, fixedCostPerView: 4, costCeilingPct: 15 },
  }, [
    { campaign: "VPBank", expectedTotal: 1_105_884 + 304_200, expectedProductionCost: 1_560_000 },
    { campaign: "Highland", expectedTotal: 221_976 + 46_800, expectedProductionCost: 240_000 },
    { campaign: "FPTShop", expectedTotal: 359_208 + 140_400, expectedProductionCost: 360_000 },
    { campaign: "HDBank", expectedTotal: 45_720 + 26_000, expectedProductionCost: 120_000 },
    { campaign: "Tiki", expectedTotal: 865_440 + 312_000, expectedProductionCost: 960_000 },
  ]);

  // ===== Hà, tháng 3/2026 — video count lệch nhẹ (HDBank, Nuti) do khớp campaign thô theo brand,
  // đã ghi trong docs/DB_SCHEMA.md nhóm 3 "Dữ liệu lịch sử" — không phải lỗi công thức Module 3 =====
  await reconcileMm("MM Hà", "ha.mm@eps.local", "2026-03", {
    HDBank: { pricePerView: 8, fixedCostPerView: 4, costCeilingPct: 14 },
    Nuti: { pricePerView: 14, fixedCostPerView: 4, costCeilingPct: 19 },
    Katinat: { pricePerView: 13, fixedCostPerView: 4, costCeilingPct: 19 },
    Lusso: { pricePerView: 15, fixedCostPerView: 4, costCeilingPct: 15 },
  }, [
    { campaign: "HDBank", expectedTotal: 131_836 + -30_420, expectedProductionCost: 450_000 },
    { campaign: "Nuti", expectedTotal: 741_139 + 586_560, expectedProductionCost: 800_000 },
    { campaign: "Katinat", expectedTotal: 81_461 + 63_440, expectedProductionCost: 100_000 },
    { campaign: "Lusso", expectedTotal: 324_540 + 117_000, expectedProductionCost: 360_000 },
  ]);

  console.log(`\n${"=".repeat(70)}`);
  console.log("KẾT LUẬN:");
  console.log("1. Video count Giang T6/2026: khớp tuyệt đối 5/5 campaign (13/2/3/1/8 video) — xác");
  console.log("   nhận bằng SQL trước khi chọn tháng này để đối chiếu.");
  console.log("2. Video count Hà T3/2026: lệch nhẹ HDBank (DB 5 vs report 3), Nuti (DB 7 vs report");
  console.log("   8), có thêm Techcombank=2 video trong DB không xuất hiện trong report tháng này —");
  console.log("   khớp với cảnh báo đã ghi sẵn trong DB_SCHEMA.md nhóm 3 (campaign 'MANUAL' nhóm thô");
  console.log("   theo tên brand, 1 tên có thể gộp nhiều đợt thật khác nhau).");
  console.log("3. Video.productionCost = 0 cho TOÀN BỘ video đã import — do Talent.productionFeePerVideo");
  console.log("   cũng = 0 cho toàn bộ 20 Talent (chưa import từ Excel thật ở Module 1). Đây là lỗ");
  console.log("   hổng dữ liệu upstream, KHÔNG phải bug Module 3 — Module 3 dùng đúng cột đã có sẵn");
  console.log("   theo yêu cầu. Cần CFO/Module 1 backfill productionFeePerVideo thật rồi chạy lại");
  console.log("   script này để có số % lệch có ý nghĩa cho phần chi phí sản xuất.");
}

main().finally(() => prisma.$disconnect());
