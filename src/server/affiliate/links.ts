// Tạo link affiliate Dealverse cho Talent — Module 5. dealverse.pages.dev là trang deal/voucher
// công khai của bên thứ ba (không hợp tác/không có API với EPS), nên chỉ cần sinh slug nội bộ
// cho /go/<slug>, không cần đăng ký hay đồng bộ gì với Dealverse.
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export const DEALVERSE_DEFAULT_URL = "https://dealverse.pages.dev";

// Bỏ dấu tiếng Việt, hạ thường, chỉ giữ a-z0-9 nối bằng "-". Talent chỉ có @handle TikTok (chưa
// có tên thật) vẫn slugify được bình thường vì handle cũng toàn ký tự la-tinh.
export function slugify(fullName: string): string {
  const base = fullName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");
  return base || "talent";
}

// slug + hậu tố ngẫu nhiên để tránh trùng khi nhiều Talent có tên/slug giống nhau — thử tối đa 5
// lần (thực tế gần như không thể trùng ở quy mô vài chục Talent, nhưng vẫn xử lý an toàn).
async function generateUniqueSlug(fullName: string): Promise<string> {
  const base = slugify(fullName);
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = randomBytes(3).toString("hex");
    const slug = `${base}-${suffix}`;
    const existing = await prisma.affiliateLink.findUnique({ where: { slug } });
    if (!existing) return slug;
  }
  throw new Error("Không tạo được slug affiliate link duy nhất sau 5 lần thử");
}

// Idempotent: Talent đã có link (bất kỳ trạng thái bật/tắt) thì trả lại đúng link đó, không tạo
// trùng — an toàn để gọi lại nhiều lần (hook tự động lúc tạo Talent + nút tạo tay trên UI).
export async function ensureAffiliateLink(talentId: string, fullName: string) {
  const existing = await prisma.affiliateLink.findFirst({
    where: { talentId },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const slug = await generateUniqueSlug(fullName);
  return prisma.affiliateLink.create({
    data: { talentId, slug, targetUrl: DEALVERSE_DEFAULT_URL, isActive: true },
  });
}
