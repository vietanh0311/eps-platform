// Tiện ích đọc link video. Dùng chung cho form log video trong app và script import từ Excel,
// nên giữ thuần túy — không import Prisma/Next để chạy được ở cả 2 nơi.

export type VideoPlatform = "TIKTOK" | "FACEBOOK" | "INSTAGRAM" | "YOUTUBE" | "OTHER";

// Nhận nền tảng từ URL để MM không phải chọn tay khi dán hàng loạt link.
export function detectPlatform(url: string): VideoPlatform {
  const u = url.toLowerCase();
  if (/tiktok\.com/.test(u)) return "TIKTOK";
  if (/facebook\.com|fb\.watch|fb\.com/.test(u)) return "FACEBOOK";
  if (/instagram\.com/.test(u)) return "INSTAGRAM";
  if (/youtube\.com|youtu\.be/.test(u)) return "YOUTUBE";
  return "OTHER";
}

// Bóc @handle kênh từ link (vd .../@chine_babi/video/123 -> "@chine_babi").
// Link rút gọn (vt.tiktok.com) và link facebook dạng /share/ không có handle -> null.
export function extractChannelHandle(url: string): string | null {
  const m = url.match(/(?:tiktok\.com|instagram\.com|youtube\.com)\/@([^/?#\s]+)/i);
  return m ? "@" + m[1] : null;
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value);
}

// Tách textarea "mỗi dòng 1 link" thành danh sách link đã bỏ trùng, giữ nguyên thứ tự nhập.
export function parseLinkList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const url = line.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}
