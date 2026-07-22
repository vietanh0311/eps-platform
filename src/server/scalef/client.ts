// Client gọi thẳng API admin ScaleF (ambassador.koc.com.vn/api/admin) — API-first, không scraper.
// Cấu trúc response đã xác nhận bằng tài khoản dịch vụ thật (2026-07-22): login trả `data.token`
// (JWT), `/contents` trả đúng field `link`/`status`/`source`/`event`/`publishedAt` bên dưới.
//
// QUAN TRỌNG — /contents là danh sách TOÀN MẠNG LƯỚI ScaleF, không riêng EPS: xác nhận thật
// `data.total` = 44.312 content (nhiều brand/creator ngoài EPS hoàn toàn). Vì vậy KHÔNG paginate
// toàn bộ — dùng `keyword=<hashtag>` (server search substring trong title, đã verify khớp đúng 1
// creator/lần) để chỉ lấy đúng content của từng Talent theo hashtag cá nhân, xem sync.ts.
import { z } from "zod";

const BASE_URL = process.env.SCALEF_ADMIN_BASE_URL?.trim() || "https://ambassador.koc.com.vn/api/admin";

let cachedToken: string | null = null;

// ===== Login =====

const loginEnvelopeSchema = z
  .object({
    code: z.number(),
    data: z.object({ token: z.string() }).passthrough(),
  })
  .passthrough();

async function login(): Promise<string> {
  if (cachedToken) return cachedToken;

  const email = process.env.SCALEF_ADMIN_EMAIL?.trim();
  const password = process.env.SCALEF_ADMIN_PASSWORD?.trim();
  if (!email || !password) {
    throw new Error(
      "Thiếu SCALEF_ADMIN_EMAIL / SCALEF_ADMIN_PASSWORD trong .env — cần tài khoản dịch vụ ScaleF (xem README).",
    );
  }

  const res = await fetch(`${BASE_URL}/staffs/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`ScaleF login thất bại: HTTP ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const parsed = loginEnvelopeSchema.safeParse(json);
  if (!parsed.success || parsed.data.code !== 1) {
    throw new Error(`ScaleF login trả về sai định dạng hoặc thất bại (code != 1): ${JSON.stringify(json)}`);
  }

  cachedToken = parsed.data.data.token;
  return cachedToken;
}

async function authedFetch(path: string, opts: { retryOn401?: boolean } = { retryOn401: true }): Promise<unknown> {
  const token = await login();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401 && opts.retryOn401) {
    // Token cache hết hạn giữa chừng — login lại 1 lần rồi thử tiếp, không lặp vô hạn.
    cachedToken = null;
    return authedFetch(path, { retryOn401: false });
  }
  if (!res.ok) {
    throw new Error(`ScaleF API lỗi: GET ${path} → HTTP ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ===== /contents =====

const statBreakdownSchema = z
  .object({
    total: z.number().default(0),
    waiting: z.number().optional().default(0),
    pending: z.number().optional().default(0),
    rejected: z.number().optional().default(0),
    completed: z.number().optional().default(0),
    cashback: z.number().optional().default(0),
    transfer: z.number().optional().default(0),
  })
  .passthrough();

// SCALEF_CONTENT_STATUS xác nhận thật (đếm 200 content mẫu): "waiting_approved" | "approved" |
// "rejected". So sánh CHÍNH XÁC bằng chuỗi này — không dùng regex/substring (bug đã phát hiện lúc
// verify: "waiting_approved" chứa substring "approved", regex /approved/i sẽ nhận nhầm).
const contentItemSchema = z
  .object({
    _id: z.string(),
    title: z.string().nullable().optional().default(""),
    thumbnail: z.string().nullable().optional(),
    link: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    publishedAt: z.string().nullable().optional(),
    event: z.object({ _id: z.string().optional(), name: z.string().optional() }).nullable().optional(),
    statistic: z
      .object({
        view: statBreakdownSchema,
        cash: statBreakdownSchema,
      })
      .passthrough(),
    createdBy: z
      .object({ _id: z.string().optional(), name: z.string().optional() })
      .nullable()
      .optional(),
  })
  .passthrough();

export type ScalefContentItem = z.infer<typeof contentItemSchema>;

const contentsEnvelopeSchema = z
  .object({
    code: z.number(),
    data: z
      .object({
        data: z.array(contentItemSchema),
        total: z.number().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export function extractContentUrl(item: ScalefContentItem): string {
  return item.link || `https://ambassador.koc.com.vn/content/${item._id}`;
}

export function isApprovedOnScalef(item: ScalefContentItem): boolean {
  return item.status === "approved";
}

const PAGE_LIMIT = 100;
const MAX_PAGES_PER_KEYWORD = 20; // an toàn dư — content của 1 hashtag cá nhân thực tế chỉ vài chục dòng.

// Lấy content khớp 1 hashtag cá nhân (server search substring trong title, đã verify khớp đúng 1
// creator/lần trên dữ liệu thật). KHÔNG dùng để lấy toàn bộ /contents — xem cảnh báo đầu file.
// Envelope sai ở BẤT KỲ trang nào thì dừng ngay (nguyên tắc "envelope sai thì dừng, không ghi dòng nào").
export async function fetchScalefContentsByHashtag(hashtag: string): Promise<ScalefContentItem[]> {
  const items: ScalefContentItem[] = [];
  for (let page = 0; page < MAX_PAGES_PER_KEYWORD; page++) {
    const json = await authedFetch(`/contents?page=${page}&limit=${PAGE_LIMIT}&keyword=${encodeURIComponent(hashtag)}`);
    const parsed = contentsEnvelopeSchema.safeParse(json);
    if (!parsed.success || parsed.data.code !== 1) {
      throw new Error(
        `ScaleF /contents (keyword=${hashtag}) trả về sai định dạng ở trang ${page}: ${parsed.success ? JSON.stringify(json) : parsed.error.message}`,
      );
    }
    const pageItems = parsed.data.data.data;
    items.push(...pageItems);
    if (pageItems.length < PAGE_LIMIT) break;
  }
  return items;
}

// ===== /events =====

const eventItemSchema = z
  .object({
    _id: z.string(),
    name: z.string().nullable().optional().default(""),
    status: z.string().nullable().optional(),
    startAt: z.string().nullable().optional(),
    endAt: z.string().nullable().optional(),
  })
  .passthrough();

export type ScalefEventItem = z.infer<typeof eventItemSchema>;

const eventsEnvelopeSchema = z
  .object({
    code: z.number(),
    data: z
      .object({
        data: z.array(eventItemSchema),
        total: z.number().optional(),
      })
      .passthrough(),
  })
  .passthrough();

const EVENT_PAGE_LIMIT = 100;
const MAX_EVENT_PAGES = 50; // dư an toàn — thật tế 225 event (2026-07-22), 50*100 = 5.000.

// GET /events — chỉ dùng để thu thập sẵn cho module auto-brief sau này (xem ScalefEvent trong
// schema.prisma), Module 4 không xử lý/lọc gì thêm ở đây ngoài validate + upsert nguyên trạng.
export async function fetchAllScalefEvents(): Promise<ScalefEventItem[]> {
  const items: ScalefEventItem[] = [];
  for (let page = 0; page < MAX_EVENT_PAGES; page++) {
    const json = await authedFetch(`/events?page=${page}&limit=${EVENT_PAGE_LIMIT}`);
    const parsed = eventsEnvelopeSchema.safeParse(json);
    if (!parsed.success || parsed.data.code !== 1) {
      throw new Error(`ScaleF /events trả về sai định dạng ở trang ${page}: ${parsed.success ? JSON.stringify(json) : parsed.error.message}`);
    }
    const pageItems = parsed.data.data.data;
    items.push(...pageItems);
    if (pageItems.length < EVENT_PAGE_LIMIT) break;
  }
  return items;
}
