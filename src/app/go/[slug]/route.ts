// Redirect công khai cho link affiliate Dealverse — Module 5. Route này CÔNG KHAI, không qua
// đăng nhập (loại khỏi matcher trong src/proxy.ts), vì Talent dán link này lên bio kênh social,
// bất kỳ ai bấm cũng phải redirect được ngay.
import { createHash } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const SOURCE_HOST_MAP: Record<string, string> = {
  "tiktok.com": "tiktok",
  "www.tiktok.com": "tiktok",
  "vt.tiktok.com": "tiktok",
  "instagram.com": "instagram",
  "www.instagram.com": "instagram",
  "l.instagram.com": "instagram",
  "facebook.com": "facebook",
  "www.facebook.com": "facebook",
  "m.facebook.com": "facebook",
  "l.facebook.com": "facebook",
  "youtube.com": "youtube",
  "www.youtube.com": "youtube",
  "linktr.ee": "linktree",
  "zalo.me": "zalo",
};

// Ưu tiên ?utm_source=, không có thì suy từ hostname referrer. Không nhận diện được host thì
// dùng thẳng hostname (vẫn còn giá trị thống kê); không có referrer nào = "direct".
function parseSource(referrer: string | null, searchParams: URLSearchParams): string {
  const utmSource = searchParams.get("utm_source");
  if (utmSource) return utmSource.toLowerCase();
  if (!referrer) return "direct";
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    return SOURCE_HOST_MAP[host] ?? host;
  } catch {
    return "unknown";
  }
}

// SHA-256(ip + AUTH_SECRET) — không bao giờ lưu IP thô, tái dùng secret đã có sẵn làm salt thay
// vì thêm biến môi trường mới.
function hashIp(ip: string): string {
  return createHash("sha256").update(`${ip}:${process.env.AUTH_SECRET ?? ""}`).digest("hex");
}

// VPS chạy sau reverse proxy (Coolify) nên IP thật nằm ở x-forwarded-for, không phải
// request.ip (đặc thù Vercel, không tồn tại khi tự host).
function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip");
}

// Ghi click best-effort — KHÔNG await ở nơi gọi. VPS chạy Node process sống lâu dài (không phải
// serverless/edge bị đóng băng ngay sau response) nên promise vẫn hoàn tất bình thường sau khi
// redirect đã gửi đi; lỗi ghi log (nếu có) chỉ console.error, không bao giờ throw ra ngoài.
function logClickBestEffort(linkId: string, request: NextRequest) {
  const referrer = request.headers.get("referer");
  const ip = getClientIp(request);

  prisma.linkClick
    .create({
      data: {
        linkId,
        referrer,
        source: parseSource(referrer, request.nextUrl.searchParams),
        userAgent: request.headers.get("user-agent"),
        ipHash: ip ? hashIp(ip) : null,
      },
    })
    .catch((err) => {
      console.error("Ghi click affiliate link thất bại", err);
    });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const link = await prisma.affiliateLink.findUnique({ where: { slug } });
  // Slug sai hoặc link đã Tắt → 404, không redirect, không ghi click ("Tắt" nghĩa là tắt hẳn).
  if (!link || !link.isActive) {
    return new Response("Link không tồn tại hoặc đã tắt", { status: 404 });
  }

  logClickBestEffort(link.id, request);

  return NextResponse.redirect(link.targetUrl, { status: 302 });
}
