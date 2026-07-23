"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { canEditTalent, requireRole } from "@/lib/authz";
import { Platform, TalentStatus } from "@/generated/prisma/enums";
import { ensureAffiliateLink } from "@/server/affiliate/links";

const talentSchema = z.object({
  fullName: z.string().trim().min(1, "Thiếu họ tên"),
  phone: z.string().trim().optional(),
  contentDirection: z.string().trim().optional(),
  status: z.enum(TalentStatus),
  managerId: z.string().min(1, "Thiếu MM quản lý"),
  productionFeePerVideo: z.coerce.number().int().min(0),
  joinedAt: z.string().optional(),
  notes: z.string().trim().optional(),
  scalefUsername: z.string().trim().optional(),
  scalefHashtag: z.string().trim().optional(),
  taxCode: z.string().trim().optional(),
});

function parseTalentForm(formData: FormData) {
  const parsed = talentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const d = parsed.data;
  return {
    data: {
      fullName: d.fullName,
      phone: d.phone || null,
      contentDirection: d.contentDirection || null,
      status: d.status,
      managerId: d.managerId,
      productionFeePerVideo: d.productionFeePerVideo,
      joinedAt: d.joinedAt ? new Date(d.joinedAt) : null,
      notes: d.notes || null,
      scalefUsername: d.scalefUsername || null,
      scalefHashtag: d.scalefHashtag || null,
      taxCode: d.taxCode || null,
    },
  };
}

// MM chỉ được tạo/gán Talent cho chính mình; system admin (Team Tech/Team Finance) gán cho MM bất kỳ.
async function assertManagerAllowed(userRole: string, userId: string, managerId: string) {
  if (userRole === "MM" && managerId !== userId) {
    return "MM chỉ được gán Talent cho chính mình";
  }
  const manager = await prisma.user.findUnique({ where: { id: managerId } });
  if (!manager || manager.role !== "MM") return "Người quản lý phải có role MM";
  return null;
}

export async function createTalent(formData: FormData) {
  const user = await requireRole("CFO", "TECH", "MM");
  const result = parseTalentForm(formData);
  if ("error" in result) redirect(`/talents/new?error=${encodeURIComponent(result.error!)}`);

  const managerError = await assertManagerAllowed(user.role, user.id, result.data!.managerId);
  if (managerError) redirect(`/talents/new?error=${encodeURIComponent(managerError)}`);

  const talent = await prisma.talent.create({ data: result.data! });
  await logAudit({
    userId: user.id,
    action: "CREATE",
    entity: "talents",
    entityId: talent.id,
    detail: `Tạo Talent ${talent.fullName}`,
  });
  // Module 5 — tự động tạo link affiliate Dealverse cho Talent mới. Lỗi ở đây (hiếm) không được
  // chặn việc tạo Talent — CFO/MM vẫn tạo được link tay sau ở trang chi tiết Talent.
  try {
    await ensureAffiliateLink(talent.id, talent.fullName);
  } catch (err) {
    console.error("Không tạo được link affiliate tự động cho Talent mới", talent.id, err);
  }
  revalidatePath("/talents");
  redirect(`/talents/${talent.id}`);
}

export async function updateTalent(talentId: string, formData: FormData) {
  const user = await requireRole("CFO", "TECH", "MM");
  const existing = await prisma.talent.findUnique({ where: { id: talentId } });
  if (!existing) redirect("/talents");
  if (!canEditTalent(user, existing.managerId)) redirect("/talents");

  const result = parseTalentForm(formData);
  if ("error" in result)
    redirect(`/talents/${talentId}?error=${encodeURIComponent(result.error!)}`);

  const managerError = await assertManagerAllowed(user.role, user.id, result.data!.managerId);
  if (managerError) redirect(`/talents/${talentId}?error=${encodeURIComponent(managerError)}`);

  await prisma.talent.update({ where: { id: talentId }, data: result.data! });
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "talents",
    entityId: talentId,
    detail: `Cập nhật Talent ${result.data!.fullName}`,
  });
  revalidatePath("/talents");
  revalidatePath(`/talents/${talentId}`);
  redirect(`/talents/${talentId}?saved=1`);
}

const channelSchema = z.object({
  platform: z.enum(Platform),
  handle: z.string().trim().min(1, "Thiếu tên kênh"),
  url: z.string().trim().url("URL kênh không hợp lệ"),
  followerCount: z.coerce.number().int().min(0).optional(),
  isPrimary: z.coerce.boolean().optional(),
});

export async function addChannel(talentId: string, formData: FormData) {
  const user = await requireRole("CFO", "TECH", "MM");
  const talent = await prisma.talent.findUnique({ where: { id: talentId } });
  if (!talent || !canEditTalent(user, talent.managerId)) redirect("/talents");

  const parsed = channelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(
      `/talents/${talentId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Kênh không hợp lệ")}`,
    );
  }
  const d = parsed.data;

  const channel = await prisma.talentChannel.create({
    data: {
      talentId,
      platform: d.platform,
      handle: d.handle,
      url: d.url,
      followerCount: d.followerCount ?? null,
      isPrimary: d.isPrimary ?? false,
    },
  });
  await logAudit({
    userId: user.id,
    action: "CREATE",
    entity: "talent_channels",
    entityId: channel.id,
    detail: `Thêm kênh ${d.platform}/${d.handle} cho Talent ${talent.fullName}`,
  });
  revalidatePath(`/talents/${talentId}`);
  redirect(`/talents/${talentId}`);
}

export async function deleteChannel(channelId: string) {
  const user = await requireRole("CFO", "TECH", "MM");
  const channel = await prisma.talentChannel.findUnique({
    where: { id: channelId },
    include: { talent: true },
  });
  if (!channel || !canEditTalent(user, channel.talent.managerId)) redirect("/talents");

  await prisma.talentChannel.delete({ where: { id: channelId } });
  await logAudit({
    userId: user.id,
    action: "DELETE",
    entity: "talent_channels",
    entityId: channelId,
    detail: `Xóa kênh ${channel.platform}/${channel.handle} của Talent ${channel.talent.fullName}`,
  });
  revalidatePath(`/talents/${channel.talentId}`);
  redirect(`/talents/${channel.talentId}`);
}
