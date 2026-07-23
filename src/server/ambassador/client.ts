// Client gọi API public Ambassador (ambassador.koc.com.vn) — public, KHÔNG cần đăng nhập/token,
// khác hẳn client ScaleF (Module 4) vốn cần login. Đã verify trực tiếp 2 endpoint thật trước khi
// viết schema (xem docs/DB_SCHEMA.md nhóm 3 + docs/MODULE_PROMPTS.md).
import { z } from "zod";

const BASE_URL = "https://ambassador.koc.com.vn/api/public";

// ===== /news?type=home_list =====

export const newsItemSchema = z
  .object({
    _id: z.string().regex(/^[a-f0-9]{24}$/i, "_id phải là 24-hex"),
    title: z.string(),
    desc: z.string().default(""),
    action: z.object({ value: z.url() }).passthrough(),
    startAt: z.iso.datetime({ offset: true }),
    endAt: z.iso.datetime({ offset: true }),
    photo: z
      .object({
        dimensions: z
          .object({ md: z.object({ url: z.string() }).passthrough() })
          .passthrough(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export type AmbassadorNewsItem = z.infer<typeof newsItemSchema>;

// Envelope chỉ xác nhận HÌNH DẠNG chung (code, data.news là mảng) — KHÔNG ràng buộc từng item ở
// bước này, để 1 item lẻ sai schema không làm hỏng cả lô. sync.ts tự parse lại từng item bằng
// newsItemSchema và bỏ qua đúng item đó nếu lỗi (nguyên tắc "envelope sai thì dừng, item lẻ sai
// thì bỏ qua item đó").
const newsEnvelopeSchema = z
  .object({
    code: z.number(),
    data: z.object({ news: z.array(z.unknown()) }).passthrough(),
  })
  .passthrough();

export async function fetchAmbassadorNews(): Promise<unknown[]> {
  const res = await fetch(`${BASE_URL}/news?type=home_list`);
  if (!res.ok) throw new Error(`Ambassador /news lỗi: HTTP ${res.status} ${res.statusText}`);
  const json = await res.json();
  const parsed = newsEnvelopeSchema.safeParse(json);
  if (!parsed.success || parsed.data.code !== 1) {
    throw new Error(
      `Ambassador /news trả về sai định dạng: ${parsed.success ? JSON.stringify(json) : parsed.error.message}`,
    );
  }
  return parsed.data.data.news;
}

// ===== /partners =====

const partnerItemSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
  })
  .passthrough();

export type AmbassadorPartner = z.infer<typeof partnerItemSchema>;

// CHÚ Ý cấu trúc lồng 2 tầng thật — {code, data: {data: [...]}} — đã verify trực tiếp, KHÔNG phải
// {code, data: [...]}.
const partnersEnvelopeSchema = z
  .object({
    code: z.number(),
    data: z.object({ data: z.array(partnerItemSchema) }).passthrough(),
  })
  .passthrough();

export async function fetchAmbassadorPartners(): Promise<AmbassadorPartner[]> {
  const res = await fetch(`${BASE_URL}/partners`);
  if (!res.ok) throw new Error(`Ambassador /partners lỗi: HTTP ${res.status} ${res.statusText}`);
  const json = await res.json();
  const parsed = partnersEnvelopeSchema.safeParse(json);
  if (!parsed.success || parsed.data.code !== 1) {
    throw new Error(
      `Ambassador /partners trả về sai định dạng: ${parsed.success ? JSON.stringify(json) : parsed.error.message}`,
    );
  }
  return parsed.data.data.data;
}
