// Import log video air từ file Excel "Hồ sơ Talent.xlsx" (export từ Google Sheets).
//
// Cách dùng:
//   Liệt kê các tháng có thể import:
//     npx tsx scripts/import-videos.ts
//   Xem trước (không ghi DB):
//     npx tsx scripts/import-videos.ts --months=2026-01..2026-07
//   Ghi thật:
//     npx tsx scripts/import-videos.ts --months=2026-01..2026-07 --write
//   Nạp thêm nội dung brief thật từ sheet "Brief Tổng" khi tạo campaign mới:
//     npx tsx scripts/import-videos.ts --months=2026-01..2026-07 --write --briefs
//
// Đọc các sheet "Quản lý air clip tháng X2026" (chỉ 2026 — đã kiểm chứng cấu trúc cột giống
// nhau). CỐ Ý không đưa các sheet trùng/backup vào danh sách: "…tháng 12026 Du" (bản sao y hệt
// bản chính), "Lock - …", "Sheet15/16", "… bản lo", "Giang report …" — những sheet đó không có
// trong MONTH_SHEETS nên script không bao giờ đọc tới.
//
// Quy tắc khớp Talent (thác 3 bước, dừng ở bước đầu tiên khớp được):
//  1. @handle bóc từ Link Air ↔ talent_channels.handle
//  2. Tên hiển thị "Kênh Air" ↔ talent_channels.handle (bắt các link Facebook dạng /share/
//     không có handle trong URL — kênh Facebook trong DB lưu handle = tên hiển thị trang)
//  3. Tên cột "Talent" ↔ talents.fullName, thu hẹp theo MM của dòng nếu tên bị trùng
// Phát hiện quan trọng khi khảo sát: Ly và Phanh Têy (2 Talent MM Hà) có CÙNG TikTok handle
// "@pateyyne_" trong DB (nhiều khả năng lỗi nhập liệu ở Module 1) — bước 1 coi handle này là
// MƠ HỒ và tự rơi xuống bước 2 (tên kênh Facebook phân biệt được 2 người).
//
// 3 luồng trạng thái ánh xạ đúng 3 cột check trong sheet cũ:
//  - "Tech check nhận video" TRUE → pipeline RECEIVED (+ 1 dòng lịch sử, actor = Tech)
//  - "MM check đã gửi videos lên hệ thống" TRUE → hiểu là Tech đã nộp VÀ MM đã xác nhận (luồng
//    ScaleF đã sửa theo quyết định 2026-07-22: Tech nộp / MM xác nhận) → pipeline SENT_SCALEF
//  - "Hệ thống duyệt": Duyệt→APPROVED, Từ chối→NEEDS_FIX, Pending/trống→PENDING
// Sheet cũ KHÔNG lưu giờ thao tác thật — 2 mốc nộp/xác nhận ScaleF của dữ liệu import lấy XẤP XỈ
// theo ngày air, không phải giờ bấm nút thật.
//
// Idempotent: bỏ qua video đã có videoUrl trùng trong DB — chạy lại (kể cả nhiều tháng chồng
// nhau) không tạo trùng.
import "dotenv/config";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { CampaignSource, PipelineStatus, ReviewStatus } from "../src/generated/prisma/enums";
import { detectPlatform, extractChannelHandle, isHttpUrl } from "../src/lib/video-url";

const DEFAULT_FILE = "data/Hồ sơ Talent.xlsx";

const MONTH_SHEETS: Record<string, string> = {
  "2026-01": "Quản lý air clip tháng 12026",
  "2026-02": "Quản lý air clip tháng 22026",
  "2026-03": "Quản lý air clip tháng 32026",
  "2026-04": "Quản lý air clip tháng 42026",
  "2026-05": "Quản lý air clip tháng 52026",
  "2026-06": "Quản lý air clip tháng 62026",
  "2026-07": "Quản lý air clip tháng 72026",
};

const COL = {
  date: "Date",
  link: "Link Air",
  channel: "Kênh Air",
  mm: "MM",
  campaign: "Campaign",
  talent: "Talent",
  techCheck: "Tech check nhận video",
  mmCheck: "MM check đã gửi",
  review: "Hệ thống duyệt",
} as const;

// Tag nội bộ (không phải campaign từ Ambassador) → source OTHER.
const INTERNAL_TAGS = new Set(["aff", "booking", "build kênh", "xây kênh"]);

type Row = string[];

function findCol(head: string[], name: string): number {
  return head.findIndex((h) => h === name || h.startsWith(name));
}

function normalizeKey(s: string): string {
  return s.trim().replace(/^@/, "").toLowerCase();
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function isTrueValue(v: unknown): boolean {
  return String(v ?? "").trim().toUpperCase() === "TRUE";
}

// Toàn bộ dữ liệu quan sát được là ngày-trước: D/M/YY, DD/M/YY, D/MM/YY, DD/MM/YYYY...
// Một vài dòng lẻ tẻ bị gõ kiểu tháng-trước (Mỹ) khiến "tháng" > 12 — trường hợp đó CHỈ có 1
// cách đọc hợp lệ (đảo lại) nên không mơ hồ, an toàn để tự sửa thay vì bỏ qua cả dòng.
function parseAirDate(raw: string): Date | null {
  const s = raw.trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let day = Number(m[1]);
  let month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month > 12) [day, month] = [month, day];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

// Vài link bị mất tiền tố "https://" khi copy vào sheet (quan sát được ở dữ liệu thật) — vẫn là
// domain hợp lệ nên tự thêm lại, không đoán nội dung link.
function normalizeLink(raw: string): string {
  const s = raw.trim();
  if (!s || /^https?:\/\//i.test(s)) return s;
  if (/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(s)) return "https://" + s;
  return s;
}

// MANUAL (không phải AMBASSADOR): campaign này được dựng lại từ log Excel lịch sử, không phải do
// module đồng bộ Ambassador tạo ra — để dành giá trị AMBASSADOR đúng nghĩa cho campaign có
// external_key/last_synced_at thật, tránh sync sau này hiểu nhầm 315 video vừa import là đã sync.
function classifySource(tag: string): CampaignSource {
  return INTERNAL_TAGS.has(normalizeName(tag)) ? "INTERNAL" : "MANUAL";
}

type BriefEntry = { form: string; policy: string; time: string; status: string; note: string };

// Sheet "Brief Tổng": STT | Nhãn hàng | (trống) | Hình thức | Chính sách thưởng | Thời gian |
// Trạng thái | Ghi chú — cột theo chỉ số vì header có 1 cột không tên.
function loadBriefIndex(wb: XLSX.WorkBook): Map<string, BriefEntry[]> {
  const index = new Map<string, BriefEntry[]>();
  const ws = wb.Sheets["Brief Tổng"];
  if (!ws) return index;
  const rows = XLSX.utils.sheet_to_json<Row>(ws, { defval: "", raw: false, header: 1 }) as unknown as Row[];
  for (const row of rows.slice(1)) {
    const brand = String(row[1] ?? "").trim();
    if (!brand) continue;
    const entry: BriefEntry = {
      form: String(row[3] ?? "").trim(),
      policy: String(row[4] ?? "").trim(),
      time: String(row[5] ?? "").trim(),
      status: String(row[6] ?? "").trim(),
      note: String(row[7] ?? "").trim(),
    };
    const key = normalizeName(brand);
    index.set(key, [...(index.get(key) ?? []), entry]);
  }
  return index;
}

function briefTextFor(tag: string, index: Map<string, BriefEntry[]>): string | null {
  const key = normalizeName(tag);
  const matches: BriefEntry[] = [];
  for (const [brand, entries] of index) {
    if (brand.includes(key) || key.includes(brand)) matches.push(...entries);
  }
  if (!matches.length) return null;
  return matches
    .map(
      (e) =>
        `• ${e.form || "?"}: ${e.policy || "?"} — ${e.time || "?"} (${e.status || "?"})${e.note ? " — " + e.note : ""}`,
    )
    .join("\n");
}

function parseArgs(argv: string[]) {
  let file = DEFAULT_FILE;
  let write = false;
  let briefs = false;
  let monthsArg: string | null = null;
  for (const a of argv) {
    if (a === "--write") write = true;
    else if (a === "--briefs") briefs = true;
    else if (a.startsWith("--months=")) monthsArg = a.slice("--months=".length);
    else if (!a.startsWith("--")) file = a;
  }
  return { file, write, briefs, monthsArg };
}

function resolveMonths(monthsArg: string | null): string[] {
  if (!monthsArg) return [];
  if (monthsArg === "all") return Object.keys(MONTH_SHEETS);
  if (monthsArg.includes("..")) {
    const [from, to] = monthsArg.split("..");
    return Object.keys(MONTH_SHEETS)
      .filter((m) => m >= from && m <= to)
      .sort();
  }
  return monthsArg
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

type VideoPlan = {
  kind: "video";
  monthKey: string;
  rowNum: number;
  talentId: string;
  talentName: string;
  managerId: string;
  campaignTag: string | null;
  airDate: Date;
  videoUrl: string;
  platform: ReturnType<typeof detectPlatform>;
  techReceived: boolean;
  scalefDone: boolean;
  reviewStatus: ReviewStatus;
};
type SkipPlan = { kind: "skip"; monthKey: string; rowNum: number; reason: string };
type RowPlan = VideoPlan | SkipPlan;

async function main() {
  const { file, write, briefs, monthsArg } = parseArgs(process.argv.slice(2));
  const wb = XLSX.read(readFileSync(file), { type: "buffer" });

  const months = resolveMonths(monthsArg);
  if (months.length === 0) {
    console.log(`Các tháng có thể import từ "${file}" (chỉ liệt kê sheet đã kiểm chứng cấu trúc):\n`);
    for (const [key, sheetName] of Object.entries(MONTH_SHEETS)) {
      const ws = wb.Sheets[sheetName];
      if (!ws) {
        console.log(`  ${key}: KHÔNG tìm thấy sheet "${sheetName}" trong file`);
        continue;
      }
      const rows = XLSX.utils.sheet_to_json<Row>(ws, { defval: "", raw: false, header: 1 }) as unknown as Row[];
      const head = rows[0].map((h) => String(h).trim());
      const iLink = findCol(head, COL.link);
      const real = rows.slice(1).filter((r) => String(r[iLink] ?? "").trim());
      console.log(`  ${key}: ${real.length} dòng có dữ liệu  (sheet "${sheetName}")`);
    }
    console.log('\nChạy lại kèm --months=2026-01..2026-07 (hoặc "2026-01,2026-03") để xem trước.');
    console.log('Thêm --write để ghi thật, --briefs để nạp nội dung brief thật từ sheet "Brief Tổng".');
    return;
  }

  console.log(`Chế độ: ${write ? "GHI THẬT vào DB" : "XEM TRƯỚC (không ghi)"}`);
  console.log(`Tháng: ${months.join(", ")}\n`);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

  const [talents, mms, techUser, existingCampaigns] = await Promise.all([
    prisma.talent.findMany({ include: { channels: true } }),
    prisma.user.findMany({ where: { role: "MM" } }),
    prisma.user.findFirst({ where: { role: "TECH" } }),
    prisma.campaign.findMany(),
  ]);

  if (write && !techUser) {
    console.error(
      'Chưa có tài khoản TECH nào trong hệ thống — cần seed trước (npm run db:seed).\n' +
        '"MM check đã gửi videos lên hệ thống" trong sheet cũ được hiểu là Tech đã nộp ScaleF,\n' +
        "nên script cần 1 tài khoản TECH để gán làm người nộp.",
    );
    process.exit(1);
  }

  // --- Chỉ mục khớp Talent ---
  // Handle bị trùng giữa >1 Talent (đã phát hiện: Ly/Phanh Têy cùng "@pateyyne_") -> đánh dấu mơ
  // hồ, KHÔNG dùng để khớp, tự rơi xuống bước kế tiếp trong matchTalent().
  const channelIndex = new Map<string, { talentId: string; ambiguous: boolean }>();
  for (const t of talents) {
    for (const c of t.channels) {
      const key = normalizeKey(c.handle);
      const existing = channelIndex.get(key);
      if (existing && existing.talentId !== t.id) existing.ambiguous = true;
      else if (!existing) channelIndex.set(key, { talentId: t.id, ambiguous: false });
    }
  }
  const talentById = new Map(talents.map((t) => [t.id, t]));
  const talentsByName = new Map<string, typeof talents>();
  for (const t of talents) {
    const key = normalizeName(t.fullName);
    talentsByName.set(key, [...(talentsByName.get(key) ?? []), t]);
  }
  function resolveMM(name: string) {
    return mms.find((u) => u.fullName.toLowerCase().includes(name.trim().toLowerCase()));
  }
  function matchTalent(row: { link: string; channel: string; talentName: string; mmName: string }):
    | { ok: true; talent: (typeof talents)[number] }
    | { ok: false; reason: string } {
    const handle = extractChannelHandle(row.link);
    if (handle) {
      const found = channelIndex.get(normalizeKey(handle));
      if (found && !found.ambiguous) return { ok: true, talent: talentById.get(found.talentId)! };
    }
    if (row.channel) {
      const found = channelIndex.get(normalizeKey(row.channel));
      if (found && !found.ambiguous) return { ok: true, talent: talentById.get(found.talentId)! };
    }
    if (row.talentName) {
      const candidates = talentsByName.get(normalizeName(row.talentName)) ?? [];
      if (candidates.length === 1) return { ok: true, talent: candidates[0] };
      if (candidates.length > 1) {
        const mm = row.mmName ? resolveMM(row.mmName) : undefined;
        const narrowed = mm ? candidates.filter((t) => t.managerId === mm.id) : candidates;
        if (narrowed.length === 1) return { ok: true, talent: narrowed[0] };
        return { ok: false, reason: `Tên "${row.talentName}" trùng giữa nhiều Talent, không xác định được MM` };
      }
    }
    return {
      ok: false,
      reason: `Không khớp được Talent (kênh: "${row.channel || "-"}", tên: "${row.talentName || "-"}")`,
    };
  }

  const campaignByKey = new Map(existingCampaigns.map((c) => [normalizeName(c.name), c]));
  const briefIndex = briefs ? loadBriefIndex(wb) : new Map<string, BriefEntry[]>();

  // --- Đọc từng tháng, dựng kế hoạch từng dòng ---
  const plans: RowPlan[] = [];
  const anomalies: { monthKey: string; rowNum: number; field: string; value: string }[] = [];
  const monthMismatches: { monthKey: string; rowNum: number; parsed: string }[] = [];

  for (const monthKey of months) {
    const sheetName = MONTH_SHEETS[monthKey];
    if (!sheetName) {
      console.log(`⚠ Bỏ qua "${monthKey}": không phải tháng hợp lệ (xem danh sách khi chạy không tham số)`);
      continue;
    }
    const ws = wb.Sheets[sheetName];
    if (!ws) {
      console.log(`⚠ Bỏ qua ${monthKey}: không tìm thấy sheet "${sheetName}" trong file`);
      continue;
    }
    const rows = XLSX.utils.sheet_to_json<Row>(ws, { defval: "", raw: false, header: 1 }) as unknown as Row[];
    const head = rows[0].map((h) => String(h).trim());
    const idx = {
      date: findCol(head, COL.date),
      link: findCol(head, COL.link),
      channel: findCol(head, COL.channel),
      mm: findCol(head, COL.mm),
      campaign: findCol(head, COL.campaign),
      talent: findCol(head, COL.talent),
      tech: findCol(head, COL.techCheck),
      mmSent: findCol(head, COL.mmCheck),
      review: findCol(head, COL.review),
    };
    const [expYear, expMonth] = monthKey.split("-").map(Number);

    rows.slice(1).forEach((row, i) => {
      const rowNum = i + 2; // 1-based + đã bỏ header
      const linkRaw = String(row[idx.link] ?? "").trim();
      if (!linkRaw) return; // dòng trống trong sheet (đa số) — không phải lỗi, bỏ qua âm thầm
      const link = normalizeLink(linkRaw);

      if (!isHttpUrl(link)) {
        plans.push({ kind: "skip", monthKey, rowNum, reason: `Link không hợp lệ: "${link.slice(0, 60)}"` });
        return;
      }
      const dateRaw = String(row[idx.date] ?? "").trim();
      const airDate = parseAirDate(dateRaw);
      if (!airDate) {
        plans.push({ kind: "skip", monthKey, rowNum, reason: `Ngày không đọc được: "${dateRaw || "(trống)"}"` });
        return;
      }
      if (airDate.getUTCFullYear() !== expYear || airDate.getUTCMonth() + 1 !== expMonth) {
        monthMismatches.push({ monthKey, rowNum, parsed: airDate.toISOString().slice(0, 10) });
      }

      const match = matchTalent({
        link,
        channel: String(row[idx.channel] ?? "").trim(),
        talentName: String(row[idx.talent] ?? "").trim(),
        mmName: String(row[idx.mm] ?? "").trim(),
      });
      if (!match.ok) {
        plans.push({ kind: "skip", monthKey, rowNum, reason: match.reason });
        return;
      }

      const rawMmSent = String(row[idx.mmSent] ?? "").trim();
      if (rawMmSent && !["TRUE", "FALSE"].includes(rawMmSent.toUpperCase())) {
        anomalies.push({ monthKey, rowNum, field: COL.mmCheck, value: rawMmSent });
      }
      const reviewRaw = String(row[idx.review] ?? "").trim();
      const reviewStatus: ReviewStatus =
        reviewRaw === "Duyệt" ? "APPROVED" : reviewRaw === "Từ chối" ? "NEEDS_FIX" : "PENDING";

      plans.push({
        kind: "video",
        monthKey,
        rowNum,
        talentId: match.talent.id,
        talentName: match.talent.fullName,
        managerId: match.talent.managerId,
        campaignTag: String(row[idx.campaign] ?? "").trim() || null,
        airDate,
        videoUrl: link,
        platform: detectPlatform(link),
        techReceived: isTrueValue(row[idx.tech]),
        scalefDone: isTrueValue(rawMmSent),
        reviewStatus,
      });
    });
  }

  const videoPlans = plans.filter((p): p is VideoPlan => p.kind === "video");
  const skipPlans = plans.filter((p): p is SkipPlan => p.kind === "skip");

  const existingUrls = new Set(
    videoPlans.length
      ? (
          await prisma.video.findMany({
            where: { videoUrl: { in: videoPlans.map((p) => p.videoUrl) } },
            select: { videoUrl: true },
          })
        ).map((v) => v.videoUrl)
      : [],
  );
  const toCreate = videoPlans.filter((p) => !existingUrls.has(p.videoUrl));
  const alreadyExists = videoPlans.length - toCreate.length;
  const newCampaignTags = [...new Set(toCreate.map((p) => p.campaignTag).filter((t): t is string => !!t))].filter(
    (tag) => !campaignByKey.has(normalizeName(tag)),
  );

  // --- In báo cáo ---
  console.log("=".repeat(64));
  for (const monthKey of months) {
    const vs = videoPlans.filter((p) => p.monthKey === monthKey);
    const sk = skipPlans.filter((p) => p.monthKey === monthKey);
    const created = vs.filter((p) => !existingUrls.has(p.videoUrl)).length;
    const dup = vs.length - created;
    console.log(
      `${monthKey}: ${vs.length} khớp Talent (${created} sẽ tạo mới${dup ? `, ${dup} đã có sẵn` : ""}), ${sk.length} bỏ qua`,
    );
  }
  console.log("=".repeat(64));

  if (skipPlans.length) {
    console.log("\nDòng bị bỏ qua (gộp theo lý do):");
    const byReason = new Map<string, number>();
    for (const p of skipPlans) byReason.set(p.reason, (byReason.get(p.reason) ?? 0) + 1);
    for (const [reason, count] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(3)}x  ${reason}`);
    }
  }
  if (monthMismatches.length) {
    console.log(`\n⚠ ${monthMismatches.length} dòng có ngày air lệch khỏi tháng của sheet chứa nó (vẫn import bình thường):`);
    monthMismatches.slice(0, 10).forEach((m) => console.log(`    ${m.monthKey} dòng ${m.rowNum}: ngày air = ${m.parsed}`));
    if (monthMismatches.length > 10) console.log(`    ... và ${monthMismatches.length - 10} dòng khác`);
  }
  if (anomalies.length) {
    console.log(`\n⚠ ${anomalies.length} dòng có giá trị lạ ở cột "MM check đã gửi" (không phải TRUE/FALSE — coi là FALSE):`);
    anomalies.forEach((a) => console.log(`    ${a.monthKey} dòng ${a.rowNum}: "${a.value}"`));
  }
  if (!techUser) {
    console.log('\n⚠ Chưa có tài khoản TECH — --write sẽ dừng lại vì cần 1 tài khoản để gán "người nộp ScaleF".');
  }

  console.log(
    `\nCampaign cần tạo mới (${newCampaignTags.length}): ${newCampaignTags.length ? newCampaignTags.join(", ") : "(không có)"}`,
  );
  console.log(
    `\nTổng: ${toCreate.length} video sẽ tạo, ${alreadyExists} đã có sẵn (bỏ qua), ${skipPlans.length} dòng lỗi/không khớp.`,
  );
  console.log(
    '⚠ Lưu ý: thời điểm nộp/xác nhận ScaleF của dữ liệu import lấy XẤP XỈ theo ngày air — sheet cũ không lưu giờ thao tác thật.',
  );

  if (!write) {
    console.log("\nChạy lại kèm --write để ghi thật.");
    await prisma.$disconnect();
    return;
  }

  // --- Ghi thật ---
  console.log("\nĐang ghi vào DB...");
  const campaignIdByTag = new Map(existingCampaigns.map((c) => [normalizeName(c.name), c.id]));
  for (const tag of newCampaignTags) {
    const key = normalizeName(tag);
    const firstRow = toCreate.find((p) => p.campaignTag && normalizeName(p.campaignTag) === key)!;
    const brief = briefs ? briefTextFor(tag, briefIndex) : null;
    const created = await prisma.campaign.create({
      data: {
        name: tag,
        brandName: tag,
        source: classifySource(tag),
        managers: { create: { userId: firstRow.managerId } },
        status: "RUNNING",
        brief,
      },
    });
    campaignIdByTag.set(key, created.id);
    const ownerName = mms.find((m) => m.id === firstRow.managerId)?.fullName ?? "?";
    console.log(`  + Tạo campaign "${tag}" (phụ trách: ${ownerName}${brief ? ", có brief từ Brief Tổng" : ""})`);
  }

  let created = 0;
  for (const p of toCreate) {
    const campaignId = p.campaignTag ? (campaignIdByTag.get(normalizeName(p.campaignTag)) ?? null) : null;
    const talent = talentById.get(p.talentId)!;

    let pipelineStatus: PipelineStatus = "NOT_IN_PIPELINE";
    const events: { from: PipelineStatus; to: PipelineStatus }[] = [];
    if (p.techReceived || p.scalefDone) {
      events.push({ from: "NOT_IN_PIPELINE", to: "RECEIVED" });
      pipelineStatus = "RECEIVED";
    }
    if (p.scalefDone) {
      events.push({ from: "RECEIVED", to: "SENT_SCALEF" });
      pipelineStatus = "SENT_SCALEF";
    }

    const video = await prisma.video.create({
      data: {
        talentId: p.talentId,
        campaignId,
        airDate: p.airDate,
        platform: p.platform,
        videoUrl: p.videoUrl,
        reviewStatus: p.reviewStatus,
        pipelineStatus,
        productionCost: talent.productionFeePerVideo,
        loggedById: p.managerId,
        ...(p.scalefDone
          ? {
              scalefSubmittedById: techUser!.id,
              scalefSubmittedAt: p.airDate,
              scalefConfirmedById: p.managerId,
              scalefConfirmedAt: p.airDate,
            }
          : {}),
      },
    });

    // Cả 2 bước (nhận video / nộp ScaleF) trong sheet cũ đều là hành động của team Tech.
    for (const e of events) {
      await prisma.videoPipelineEvent.create({
        data: {
          videoId: video.id,
          fromStatus: e.from,
          toStatus: e.to,
          byUserId: techUser!.id,
          note: "Nhập từ Google Sheets (dữ liệu lịch sử)",
          at: p.airDate,
        },
      });
    }
    created++;
    if (created % 50 === 0) console.log(`  ... đã tạo ${created}/${toCreate.length}`);
  }

  console.log(`\n✔ Đã tạo ${created} video, ${newCampaignTags.length} campaign mới.`);
  await prisma.$disconnect();
}

main();
