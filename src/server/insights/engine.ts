// Engine insight rule-based (Module 6) — 5 rule đọc dữ liệu có sẵn, ghi vào bảng `insights`.
// Cùng khuôn với src/server/scalef/sync.ts: pg_try_advisory_lock chống chạy chồng, luôn trả về
// tóm tắt (không có bảng log run riêng — bảng insights tự đủ).
//
// Dedupe/lifecycle: bảng insights không có cột khóa tự nhiên như scalef_videos.scalef_key (mỗi
// rule có khóa khác nhau) — mỗi rule tự nhúng khóa xác định (`_key`) trong `data`. syncRuleInsights
// so khóa đang trigger ở lần chạy này với khóa của các dòng đang MỞ (resolvedAt=null) cùng `type`:
// khóa mới → tạo dòng mới; khóa cũ không còn trigger nữa → tự đóng (resolvedAt=now). Rule nào muốn
// luôn cập nhật số liệu mới nhất trên dòng đang mở (thay vì chỉ tạo 1 lần rồi im) truyền
// refreshExisting=true.
import { prisma } from "@/lib/prisma";
import { Role } from "@/generated/prisma/enums";
import { SYSTEM_ADMIN_ROLES } from "@/lib/roles";
import { PIPELINE_STATUS_LABELS } from "@/lib/labels";
import { computeViewVarianceGroups } from "./view-variance";

const INSIGHTS_LOCK_ID = 92026073; // khác SCALEF_SYNC_LOCK_ID (92026072) ở src/server/scalef/sync.ts

const VIDEO_LATE_HOURS = 48;
const TALENT_INACTIVE_DAYS = 14;
const VIEW_DROP_MIN_STATS = 9; // cần 9 snapshot (8 delta: 1 hiện tại + 7 trước) để so trung bình 7 ngày
const VIEW_DROP_RATIO = 0.7; // currentDelta < avg7 * 0.7  ⇔ giảm > 30%
const VIEW_ASSUMPTION_MISMATCH_THRESHOLD = 0.3; // |lệch| > 30%

type Severity = "INFO" | "WARNING" | "CRITICAL";

type RuleResult = {
  key: string;
  severity: Severity;
  visibleToRoles: Role[];
  title: string;
  message: string;
  data: Record<string, unknown>;
};

async function syncRuleInsights(
  type: string,
  results: RuleResult[],
  opts?: { refreshExisting?: boolean },
): Promise<{ created: number; resolved: number }> {
  const open = await prisma.insight.findMany({ where: { type, resolvedAt: null } });
  const currentKeys = new Set(results.map((r) => r.key));

  let created = 0;
  for (const r of results) {
    const existing = open.find((o) => (o.data as Record<string, unknown> | null)?._key === r.key);
    if (existing) {
      if (opts?.refreshExisting) {
        await prisma.insight.update({
          where: { id: existing.id },
          data: {
            severity: r.severity,
            visibleToRoles: r.visibleToRoles,
            title: r.title,
            message: r.message,
            data: { ...r.data, _key: r.key },
          },
        });
      }
      continue;
    }
    await prisma.insight.create({
      data: {
        type,
        severity: r.severity,
        visibleToRoles: r.visibleToRoles,
        title: r.title,
        message: r.message,
        data: { ...r.data, _key: r.key },
      },
    });
    created++;
  }

  let resolved = 0;
  for (const o of open) {
    const key = (o.data as Record<string, unknown> | null)?._key;
    if (typeof key === "string" && !currentKeys.has(key)) {
      await prisma.insight.update({ where: { id: o.id }, data: { resolvedAt: new Date() } });
      resolved++;
    }
  }
  return { created, resolved };
}

// ===== 1. VIDEO_LATE — video quá 48h chưa qua bước pipeline tiếp theo =====

async function ruleVideoLate(): Promise<RuleResult[]> {
  const cutoff = new Date(Date.now() - VIDEO_LATE_HOURS * 60 * 60 * 1000);
  const videos = await prisma.video.findMany({
    where: { pipelineStatus: { not: "SENT_SCALEF" } },
    select: {
      id: true,
      airDate: true,
      pipelineStatus: true,
      createdAt: true,
      talent: { select: { id: true, fullName: true, managerId: true } },
      pipelineEvents: { orderBy: { at: "desc" }, take: 1, select: { at: true } },
    },
  });

  const results: RuleResult[] = [];
  for (const v of videos) {
    const latestAt = v.pipelineEvents[0]?.at ?? v.createdAt;
    if (latestAt > cutoff) continue;
    const hoursStuck = Math.floor((Date.now() - latestAt.getTime()) / (60 * 60 * 1000));
    results.push({
      key: v.id,
      severity: "WARNING",
      visibleToRoles: [...SYSTEM_ADMIN_ROLES, Role.MM],
      title: "Video chậm tiến độ pipeline",
      message: `Video của ${v.talent.fullName} đang ở trạng thái "${PIPELINE_STATUS_LABELS[v.pipelineStatus] ?? v.pipelineStatus}" quá ${hoursStuck}h chưa chuyển bước tiếp theo.`,
      data: {
        videoId: v.id,
        talentId: v.talent.id,
        talentName: v.talent.fullName,
        managerId: v.talent.managerId,
        pipelineStatus: v.pipelineStatus,
        hoursStuck,
        airDate: v.airDate,
      },
    });
  }
  return results;
}

// ===== 2. VIEW_DROP — view giảm >30% so với trung bình 7 ngày (chỉ video đã ghép ScaleF) =====

async function ruleViewDrop(skipped: string[]): Promise<RuleResult[]> {
  const scalefVideos = await prisma.scalefVideo.findMany({
    where: { videoId: { not: null } },
    select: {
      id: true,
      video: { select: { id: true, talentId: true, talent: { select: { fullName: true, managerId: true } } } },
      dailyStats: { orderBy: { statDate: "desc" }, take: VIEW_DROP_MIN_STATS, select: { statDate: true, views: true } },
    },
  });

  const results: RuleResult[] = [];
  let skippedCount = 0;
  for (const sv of scalefVideos) {
    if (sv.dailyStats.length < VIEW_DROP_MIN_STATS) {
      skippedCount++;
      continue;
    }
    const stats = [...sv.dailyStats].reverse(); // ascending theo statDate
    const deltas: number[] = [];
    for (let i = 1; i < stats.length; i++) deltas.push(Math.max(0, stats[i].views - stats[i - 1].views));

    const currentDelta = deltas[deltas.length - 1];
    const prior7 = deltas.slice(0, deltas.length - 1);
    const avg7 = prior7.reduce((a, b) => a + b, 0) / prior7.length;
    if (avg7 <= 0 || currentDelta >= avg7 * VIEW_DROP_RATIO) continue;

    const dropPct = ((avg7 - currentDelta) / avg7) * 100;
    const statDate = stats[stats.length - 1].statDate;
    const talentName = sv.video!.talent.fullName;
    results.push({
      key: `${sv.id}|${statDate.toISOString().slice(0, 10)}`,
      severity: "WARNING",
      visibleToRoles: [...SYSTEM_ADMIN_ROLES, Role.MM],
      title: "View sụt giảm bất thường",
      message: `View của ${talentName} ngày ${statDate.toISOString().slice(0, 10)} giảm ${dropPct.toFixed(0)}% so với trung bình 7 ngày trước.`,
      data: {
        scalefVideoId: sv.id,
        videoId: sv.video!.id,
        talentId: sv.video!.talentId,
        managerId: sv.video!.talent.managerId,
        currentDelta,
        avg7,
        dropPct,
        statDate,
      },
    });
  }
  if (skippedCount > 0) {
    skipped.push(`VIEW_DROP: bỏ qua ${skippedCount} scalef_video chưa đủ ${VIEW_DROP_MIN_STATS} snapshot để so trung bình 7 ngày.`);
  }
  return results;
}

// ===== 3. SCRAPER_FAILED — đồng bộ ScaleF lỗi (đọc ScrapeRun, KHÔNG phải SyncRun) =====

async function ruleScraperFailed(): Promise<RuleResult[]> {
  const runs = await prisma.scrapeRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 });
  const results: RuleResult[] = [];
  for (const r of runs) {
    // Dừng ở lần SUCCESS gần nhất — chỉ tính chuỗi lỗi liên tiếp gần đây nhất, không phải mọi FAILED
    // trong 20 lần gần nhất (1 lỗi cũ đã được 1 lần thành công "che" thì không còn cần cảnh báo mở).
    if (r.status !== "FAILED") break;
    results.push({
      key: r.id,
      severity: "CRITICAL",
      visibleToRoles: SYSTEM_ADMIN_ROLES,
      title: "Đồng bộ ScaleF lỗi",
      message: `Lần đồng bộ ScaleF lúc ${r.startedAt.toLocaleString("vi-VN")} thất bại: ${r.errorMessage ?? "không rõ nguyên nhân"}.`,
      data: { scrapeRunId: r.id, startedAt: r.startedAt, errorMessage: r.errorMessage },
    });
  }
  return results;
}

// ===== 4. TALENT_INACTIVE — Talent ACTIVE 14 ngày không có video mới =====

async function ruleTalentInactive(): Promise<RuleResult[]> {
  const cutoff = new Date(Date.now() - TALENT_INACTIVE_DAYS * 24 * 60 * 60 * 1000);
  const talents = await prisma.talent.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      fullName: true,
      managerId: true,
      videos: { orderBy: { airDate: "desc" }, take: 1, select: { airDate: true } },
    },
  });

  const results: RuleResult[] = [];
  for (const t of talents) {
    const lastAirDate = t.videos[0]?.airDate ?? null;
    if (lastAirDate && lastAirDate >= cutoff) continue;
    const daysSince = lastAirDate ? Math.floor((Date.now() - lastAirDate.getTime()) / (24 * 60 * 60 * 1000)) : null;
    results.push({
      key: t.id,
      severity: "WARNING",
      visibleToRoles: [...SYSTEM_ADMIN_ROLES, Role.MM],
      title: "Talent không có video mới",
      message:
        lastAirDate != null
          ? `${t.fullName} chưa có video air mới trong ${daysSince} ngày.`
          : `${t.fullName} chưa từng có video air nào.`,
      data: { talentId: t.id, talentName: t.fullName, managerId: t.managerId, lastAirDate },
    });
  }
  return results;
}

// ===== 5. VIEW_ASSUMPTION_MISMATCH — lệch lớn giữa view thật vs avgViewsPerVideo giả định =====

async function ruleViewAssumptionMismatch(): Promise<RuleResult[]> {
  const groups = await computeViewVarianceGroups();
  const results: RuleResult[] = [];
  for (const g of groups) {
    if (g.assumedViews <= 0) continue;
    const pctDiff = (g.realViews - g.assumedViews) / g.assumedViews;
    if (Math.abs(pctDiff) <= VIEW_ASSUMPTION_MISMATCH_THRESHOLD) continue;

    results.push({
      key: `${g.month}|${g.talentId}`,
      severity: "WARNING",
      visibleToRoles: SYSTEM_ADMIN_ROLES,
      title: "Lệch view giả định vs view thật",
      message: `${g.talentName} tháng ${g.month}: view thật lệch ${(pctDiff * 100).toFixed(0)}% so với giả định (${g.avgViewsPerVideo.toLocaleString("vi-VN")} view/video, ${g.avgSource}).`,
      data: {
        month: g.month,
        talentId: g.talentId,
        talentName: g.talentName,
        videoCount: g.videoCount,
        assumedViews: g.assumedViews,
        realViews: g.realViews,
        pctDiff: pctDiff * 100,
      },
    });
  }
  return results;
}

// ===== Orchestrator =====

export type InsightRunResult = {
  ok: boolean;
  created: number;
  resolved: number;
  notes: string[];
  error?: string;
};

export async function runInsightRules(): Promise<InsightRunResult> {
  const lockRows = await prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${INSIGHTS_LOCK_ID}) as locked`;
  if (!lockRows[0]?.locked) {
    return { ok: false, created: 0, resolved: 0, notes: [], error: "Đang có lần chạy insight khác — bỏ qua lần này." };
  }

  let created = 0;
  let resolved = 0;
  const notes: string[] = [];
  try {
    const videoLate = await ruleVideoLate();
    const rVideoLate = await syncRuleInsights("VIDEO_LATE", videoLate);
    created += rVideoLate.created;
    resolved += rVideoLate.resolved;

    const viewDrop = await ruleViewDrop(notes);
    const rViewDrop = await syncRuleInsights("VIEW_DROP", viewDrop);
    created += rViewDrop.created;
    resolved += rViewDrop.resolved;

    const scraperFailed = await ruleScraperFailed();
    const rScraperFailed = await syncRuleInsights("SCRAPER_FAILED", scraperFailed);
    created += rScraperFailed.created;
    resolved += rScraperFailed.resolved;

    const talentInactive = await ruleTalentInactive();
    const rTalentInactive = await syncRuleInsights("TALENT_INACTIVE", talentInactive);
    created += rTalentInactive.created;
    resolved += rTalentInactive.resolved;

    const viewMismatch = await ruleViewAssumptionMismatch();
    const rViewMismatch = await syncRuleInsights("VIEW_ASSUMPTION_MISMATCH", viewMismatch, { refreshExisting: true });
    created += rViewMismatch.created;
    resolved += rViewMismatch.resolved;

    return { ok: true, created, resolved, notes };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, created, resolved, notes, error: message };
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${INSIGHTS_LOCK_ID})`;
  }
}
