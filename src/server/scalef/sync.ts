// Đồng bộ dữ liệu ScaleF: video đã duyệt, view hàng ngày, thưởng theo view/post — nguồn dữ liệu
// thật để đối chiếu với avgViewsPerVideo giả định (80.000) đang dùng ở Module 3.
// Nguyên tắc: cùng kiểu với sync Ambassador (docs/DB_SCHEMA.md nhóm 3) — envelope sai thì dừng,
// không ghi dòng nào; item thiếu field quan trọng thì bỏ qua đúng item đó; chống chạy chồng bằng
// pg_try_advisory_lock; luôn ghi 1 dòng scrape_runs dù thành công hay lỗi.
import { prisma } from "@/lib/prisma";
import {
  fetchScalefContentsByHashtag,
  fetchAllScalefEvents,
  extractContentUrl,
  isApprovedOnScalef,
  type ScalefContentItem,
} from "./client";

// Khoá cố định, không trùng với khoá nào khác trong hệ thống — chỉ 1 số nguyên 32-bit tuỳ ý.
const SCALEF_SYNC_LOCK_ID = 92026072;

// Export để /scalef (màn ghép tay) tính lại candidate/xung đột từ title đã lưu, không cần gọi lại API.
export function extractHashtags(title: string | null | undefined): string[] {
  if (!title) return [];
  const matches = title.match(/#\w+/g) ?? [];
  return matches.map((tag) => tag.slice(1).toLowerCase());
}

export function normalizeHashtag(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/^#/, "").trim().toLowerCase() || null;
}

export type SyncResult = {
  ok: boolean;
  itemsFound: number;
  error?: string;
};

export async function syncScalef(): Promise<SyncResult> {
  const startedAt = new Date();

  const lockRows = await prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${SCALEF_SYNC_LOCK_ID}) as locked`;
  if (!lockRows[0]?.locked) {
    return { ok: false, itemsFound: 0, error: "Đang có lần đồng bộ ScaleF khác chạy — bỏ qua lần này." };
  }

  let itemsFound = 0;
  try {
    // 1) Events — chỉ upsert nguyên trạng cho module auto-brief sau này, không xử lý gì thêm.
    const events = await fetchAllScalefEvents();
    for (const event of events) {
      await prisma.scalefEvent.upsert({
        where: { scalefEventId: event._id },
        create: {
          scalefEventId: event._id,
          name: event.name ?? "",
          status: event.status ?? null,
          startAt: event.startAt ? new Date(event.startAt) : null,
          endAt: event.endAt ? new Date(event.endAt) : null,
          raw: event as object,
          lastSyncedAt: new Date(),
        },
        update: {
          name: event.name ?? "",
          status: event.status ?? null,
          startAt: event.startAt ? new Date(event.startAt) : null,
          endAt: event.endAt ? new Date(event.endAt) : null,
          raw: event as object,
          lastSyncedAt: new Date(),
        },
      });
    }

    // 2) Contents — nguồn view/thưởng/trạng thái duyệt thật. /contents là danh sách TOÀN MẠNG LƯỚI
    // ScaleF (xác nhận thật: 44.312 content, không riêng EPS) — KHÔNG paginate toàn bộ, chỉ query
    // theo từng hashtag cá nhân của Talent đang active (server search substring trong title, đã
    // verify khớp đúng 1 creator/lần), rồi dedupe theo _id (1 content có thể khớp >1 hashtag nếu
    // chứa nhiều tag trùng nhau, dù hiếm).
    const activeTalents = await prisma.talent.findMany({
      where: { status: "ACTIVE", scalefHashtag: { not: null } },
      select: { id: true, scalefHashtag: true, scalefUsername: true },
    });

    const distinctHashtags = new Set(
      activeTalents.map((t) => normalizeHashtag(t.scalefHashtag)).filter((h): h is string => h !== null),
    );

    const contentsById = new Map<string, ScalefContentItem>();
    for (const hashtag of distinctHashtags) {
      const found = await fetchScalefContentsByHashtag(hashtag);
      for (const item of found) contentsById.set(item._id, item);
    }
    const contents = [...contentsById.values()];
    itemsFound = contents.length;

    const today = new Date();
    const statDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    for (const item of contents) {
      const now = new Date();
      const scalefUrl = extractContentUrl(item);
      const title = item.title ?? "";
      const approvedOnScalef = isApprovedOnScalef(item);

      const existing = await prisma.scalefVideo.findUnique({ where: { scalefKey: item._id } });
      const scalefCreatorId = item.createdBy?._id ?? null;
      const scalefCreatorName = item.createdBy?.name ?? null;
      const publishedAt = item.publishedAt ? new Date(item.publishedAt) : null;

      let scalefVideoId: string;
      if (existing) {
        // KHÔNG đụng videoId khi update — có thể đã ghép tay ở màn /scalef, sync không được ghi đè.
        await prisma.scalefVideo.update({
          where: { id: existing.id },
          data: { scalefUrl, title, approvedOnScalef, scalefCreatorId, scalefCreatorName, publishedAt, lastSeenAt: now },
        });
        scalefVideoId = existing.id;
      } else {
        const videoId = await resolveVideoId(item, activeTalents);
        const created = await prisma.scalefVideo.create({
          data: {
            scalefKey: item._id,
            scalefUrl,
            title,
            approvedOnScalef,
            scalefCreatorId,
            scalefCreatorName,
            publishedAt,
            firstSeenAt: now,
            lastSeenAt: now,
            videoId,
          },
        });
        scalefVideoId = created.id;
      }

      // Snapshot mỗi lần chạy — chỉ thêm không sửa. Bỏ qua nếu hôm nay đã có dòng cho content này
      // (script tự biết bỏ qua nếu hôm nay đã sync xong, giống daily-sync.sh bên vcd-clean).
      await prisma.scalefDailyStat.upsert({
        where: { scalefVideoId_statDate: { scalefVideoId, statDate } },
        create: {
          scalefVideoId,
          statDate,
          views: item.statistic.view.total,
          rewardAmount: item.statistic.cash.total,
        },
        update: {
          views: item.statistic.view.total,
          rewardAmount: item.statistic.cash.total,
        },
      });
    }

    await prisma.scrapeRun.create({
      data: { startedAt, finishedAt: new Date(), status: "SUCCESS", itemsFound },
    });
    return { ok: true, itemsFound };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.scrapeRun.create({
      data: { startedAt, finishedAt: new Date(), status: "FAILED", itemsFound, errorMessage: message },
    });
    return { ok: false, itemsFound, error: message };
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${SCALEF_SYNC_LOCK_ID})`;
  }
}

// So sánh tên người đăng ScaleF (`createdBy.name`) với `talents.scalef_username` — không phân
// biệt hoa/thường, bỏ khoảng trắng thừa. Đây là danh tính do chính ScaleF xác định, đáng tin hơn
// hashtag tự do trong caption (xem ghi chú điều tra trong docs/PROJECT_EPS.md, mục ScaleF matching).
function normalizeCreatorName(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.trim().toLowerCase() || null;
}

export type TalentForScalefMatch = {
  id: string;
  scalefHashtag: string | null;
  scalefUsername: string | null;
};

// Tìm tập Talent khớp với 1 content ScaleF — dùng chung cho resolveVideoId (tự gán khi sync) VÀ
// màn ghép tay /scalef (hiển thị gợi ý, tính lại từ dữ liệu đã lưu, không gọi lại API). Tín hiệu
// nhận diện, theo thứ tự ưu tiên:
// 1) hashtag trong title khớp ĐÚNG 1 Talent → dùng luôn (đường cũ, đa số trường hợp).
// 2) hashtag khớp NHIỀU Talent (xung đột) → thử thu hẹp về đúng 1 người bằng cách so
//    `createdBy.name` (ScaleF tự xác định) với `scalef_username` của từng người trong nhóm xung đột.
// 3) hashtag không khớp Talent nào (thiếu/sai hashtag trong caption) → thử khớp thẳng
//    `createdBy.name` với `scalef_username` trên toàn bộ Talent đang active.
export function resolveTalentMatch<T extends TalentForScalefMatch>(
  title: string | null | undefined,
  creatorNameRaw: string | null | undefined,
  activeTalents: T[],
): { matchedTalentIds: Set<string>; hashtagMatches: T[] } {
  const tags = new Set(extractHashtags(title));
  const creatorName = normalizeCreatorName(creatorNameRaw);

  const hashtagMatches = activeTalents.filter((t) => {
    const normalized = normalizeHashtag(t.scalefHashtag);
    return normalized && tags.has(normalized);
  });

  let matchedTalentIds: Set<string>;
  if (hashtagMatches.length > 1 && creatorName) {
    const byCreatorName = hashtagMatches.filter((t) => normalizeCreatorName(t.scalefUsername) === creatorName);
    matchedTalentIds = new Set((byCreatorName.length === 1 ? byCreatorName : hashtagMatches).map((t) => t.id));
  } else {
    matchedTalentIds = new Set(hashtagMatches.map((t) => t.id));
  }

  if (matchedTalentIds.size === 0 && creatorName) {
    const byCreatorName = activeTalents.filter((t) => normalizeCreatorName(t.scalefUsername) === creatorName);
    matchedTalentIds = new Set(byCreatorName.map((t) => t.id));
  }

  return { matchedTalentIds, hashtagMatches };
}

// Chỉ tự gán video_id khi thu hẹp được về ĐÚNG 1 Talent (xem resolveTalentMatch) VÀ đúng 1 video
// ứng viên — mọi trường hợp khác để trống, xử lý ở màn ghép tay /scalef. Tự phát hiện hashtag
// trùng bằng query, không hardcode hashtag nào.
async function resolveVideoId(
  item: ScalefContentItem,
  activeTalents: TalentForScalefMatch[],
): Promise<string | null> {
  const { matchedTalentIds } = resolveTalentMatch(item.title, item.createdBy?.name, activeTalents);
  if (matchedTalentIds.size !== 1) return null;
  const [talentId] = [...matchedTalentIds];

  const candidates = await prisma.video.findMany({
    where: {
      talentId,
      scalefSubmittedAt: { not: null },
      scalefVideos: { none: {} }, // video chưa được ScaleF video nào khác nhận
    },
    select: { id: true },
  });
  if (candidates.length !== 1) return null;
  return candidates[0].id;
}
