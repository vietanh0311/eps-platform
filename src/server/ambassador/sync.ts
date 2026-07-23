// Đồng bộ Campaign từ Ambassador (ambassador.koc.com.vn/chien-dich) — gộp thẳng vào bảng
// `campaigns` hiện có (externalKey = "ambassador:<_id>"), cùng danh sách với campaign tạo tay.
// Thiết kế đầy đủ: docs/DB_SCHEMA.md nhóm 3. Nguyên tắc chống ghi đè: sync CHỈ ghi đè các cột
// Ambassador làm chủ (descHtml/sourceUrl/coverUrl/startDate/endDate/lastSyncedAt/raw) — không bao
// giờ đụng name/brief/mmId/status/contractValue/notes/orderVideoCount/internalDeadline/isUrgent/
// brandName (người dùng sở hữu). Cùng dạng bài với src/server/scalef/sync.ts (Module 4, đã verify
// thật): advisory lock chống chạy chồng, validate trước khi ghi DB, luôn ghi 1 dòng log.
import { prisma } from "@/lib/prisma";
import {
  fetchAmbassadorNews,
  fetchAmbassadorPartners,
  newsItemSchema,
  type AmbassadorNewsItem,
  type AmbassadorPartner,
} from "./client";

const AMBASSADOR_SYNC_LOCK_ID = 778001; // khác SCALEF_SYNC_LOCK_ID (92026072) — không trùng khóa nào khác.

// UTC → GMT+7, chỉ lấy phần ngày — TUYỆT ĐỐI không cắt chuỗi ISO trực tiếp (bẫy lệch ngày đã
// verify: "2026-09-30T16:59:59.203Z" phải ra 2026-09-30, không lùi/tiến sang 10-01).
function toVnDate(iso: string): Date {
  const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
  return new Date(dateStr);
}

// Suy brandName: parse slug đầu path của action.value, đối chiếu /api/public/partners lấy tên
// đẹp; fallback lấy phần trước dấu "-" đầu tiên của title nếu không khớp partner nào. URL có thể
// nằm trên nhiều host khác nhau (đã verify thật: ít nhất 5 host), bọc try/catch quanh new URL().
function resolveBrandName(item: AmbassadorNewsItem, partners: AmbassadorPartner[]): string {
  try {
    const url = new URL(item.action.value);
    const firstSegment = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    const match = firstSegment ? partners.find((p) => p.slug.toLowerCase() === firstSegment) : undefined;
    if (match) return match.name;
  } catch {
    // rơi xuống fallback theo title bên dưới
  }
  return (item.title.split("-")[0] ?? item.title).trim();
}

export type AmbassadorSyncResult = {
  ok: boolean;
  itemsFound: number;
  error?: string;
};

export async function syncAmbassadorCampaigns(trigger: "CRON" | "MANUAL"): Promise<AmbassadorSyncResult> {
  const startedAt = new Date();
  console.log(`[ambassador:sync] bắt đầu (trigger=${trigger})`);

  const lockRows = await prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${AMBASSADOR_SYNC_LOCK_ID}) as locked`;
  if (!lockRows[0]?.locked) {
    return { ok: false, itemsFound: 0, error: "Đang có lần đồng bộ Ambassador khác chạy — bỏ qua lần này." };
  }

  let itemsFound = 0;
  try {
    const [rawNews, partners] = await Promise.all([fetchAmbassadorNews(), fetchAmbassadorPartners()]);
    const now = new Date();

    for (const raw of rawNews) {
      const parsed = newsItemSchema.safeParse(raw);
      if (!parsed.success) continue; // item lẻ sai schema — bỏ qua đúng item đó, không dừng cả lô.
      const item = parsed.data;

      const externalKey = `ambassador:${item._id}`;
      const brandName = resolveBrandName(item, partners);
      const startDate = toVnDate(item.startAt);
      const endDate = toVnDate(item.endAt);
      const coverUrl = item.photo?.dimensions?.md?.url ?? null;

      await prisma.campaign.upsert({
        where: { externalKey },
        create: {
          externalKey,
          name: item.title,
          brandName,
          source: "AMBASSADOR",
          status: "NEW",
          mmId: null,
          sourceUrl: item.action.value,
          descHtml: item.desc,
          coverUrl,
          startDate,
          endDate,
          lastSyncedAt: now,
          raw: item as object,
        },
        // Chỉ liệt kê tường minh cột Ambassador làm chủ — KHÔNG spread nguyên payload, để không
        // vô tình ghi đè name/brief/mmId/status/contractValue/notes/orderVideoCount/
        // internalDeadline/isUrgent/brandName mà người dùng đã tự sửa.
        update: {
          descHtml: item.desc,
          sourceUrl: item.action.value,
          coverUrl,
          startDate,
          endDate,
          lastSyncedAt: now,
          raw: item as object,
        },
      });
      itemsFound++;
    }

    await prisma.syncRun.create({
      data: { source: "ambassador_campaigns", startedAt, finishedAt: new Date(), ok: true, items: itemsFound },
    });
    return { ok: true, itemsFound };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.syncRun.create({
      data: { source: "ambassador_campaigns", startedAt, finishedAt: new Date(), ok: false, items: itemsFound, error: message },
    });
    return { ok: false, itemsFound, error: message };
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${AMBASSADOR_SYNC_LOCK_ID})`;
  }
}
