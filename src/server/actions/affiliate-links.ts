"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { canEditTalent, requireRole } from "@/lib/authz";
import { ensureAffiliateLink } from "@/server/affiliate/links";

// Nút "Tạo link affiliate" trên trang chi tiết Talent — idempotent (ensureAffiliateLink), quyền
// giống mọi thao tác khác trên hồ sơ Talent (CFO toàn quyền, MM chỉ Talent của mình).
export async function createAffiliateLinkForTalent(talentId: string) {
  const user = await requireRole("CFO", "MM");
  const talent = await prisma.talent.findUnique({ where: { id: talentId } });
  if (!talent || !canEditTalent(user, talent.managerId)) redirect("/talents");

  const link = await ensureAffiliateLink(talent.id, talent.fullName);
  await logAudit({
    userId: user.id,
    action: "CREATE",
    entity: "affiliate_links",
    entityId: link.id,
    detail: `Tạo link affiliate cho Talent ${talent.fullName}`,
  });
  revalidatePath(`/talents/${talentId}`);
}

// Bật/tắt link — tắt nghĩa là tắt hẳn: /go/<slug> trả 404, không redirect, không ghi click nữa
// (xem src/app/go/[slug]/route.ts).
export async function toggleAffiliateLink(linkId: string) {
  const user = await requireRole("CFO", "MM");
  const link = await prisma.affiliateLink.findUnique({
    where: { id: linkId },
    include: { talent: true },
  });
  if (!link || !canEditTalent(user, link.talent.managerId)) redirect("/talents");

  const updated = await prisma.affiliateLink.update({
    where: { id: linkId },
    data: { isActive: !link.isActive },
  });
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "affiliate_links",
    entityId: linkId,
    detail: `${updated.isActive ? "Bật" : "Tắt"} link affiliate của Talent ${link.talent.fullName}`,
  });
  revalidatePath(`/talents/${link.talentId}`);
}

const targetUrlSchema = z.object({
  targetUrl: z.string().trim().url("URL đích không hợp lệ"),
});

// Sửa target_url — mặc định là trang chủ Dealverse lúc tạo, CFO/MM đổi sau nếu muốn trỏ trang cụ
// thể hơn (VD 1 deal riêng) mà không cần mở Prisma Studio.
export async function updateAffiliateLinkTarget(linkId: string, formData: FormData) {
  const user = await requireRole("CFO", "MM");
  const link = await prisma.affiliateLink.findUnique({
    where: { id: linkId },
    include: { talent: true },
  });
  if (!link || !canEditTalent(user, link.talent.managerId)) redirect("/talents");

  const parsed = targetUrlSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(
      `/talents/${link.talentId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "URL không hợp lệ")}`,
    );
  }

  await prisma.affiliateLink.update({
    where: { id: linkId },
    data: { targetUrl: parsed.data.targetUrl },
  });
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "affiliate_links",
    entityId: linkId,
    detail: `Đổi target_url link affiliate của Talent ${link.talent.fullName} thành ${parsed.data.targetUrl}`,
  });
  revalidatePath(`/talents/${link.talentId}`);
}
