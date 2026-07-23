"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { canEditCampaign, requireRole } from "@/lib/authz";
import { AssignmentStatus, CampaignSource, CampaignStatus } from "@/generated/prisma/enums";

// Campaign/Brief — MM nhận brief và giao việc cho Talent mình quản lý.
// Mọi action tự kiểm tra quyền lại (proxy chỉ là lớp chặn ngoài).

const campaignSchema = z.object({
  name: z.string().trim().min(1, "Thiếu tên campaign"),
  brandName: z.string().trim().min(1, "Thiếu tên nhãn hàng"),
  source: z.enum(CampaignSource),
  brief: z.string().trim().optional(),
  contractValue: z.string().trim().optional(),
  mmId: z.string().min(1, "Thiếu MM phụ trách"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(CampaignStatus),
  notes: z.string().trim().optional(),
  sourceUrl: z.string().trim().optional(),
});

function parseCampaignForm(formData: FormData) {
  const parsed = campaignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const d = parsed.data;

  if (d.sourceUrl && !/^https?:\/\//i.test(d.sourceUrl)) {
    return { error: "Link thể lệ phải bắt đầu bằng http:// hoặc https://" };
  }
  const contractValue = d.contractValue ? Number(d.contractValue.replace(/\D/g, "")) : null;
  if (contractValue !== null && !Number.isFinite(contractValue)) {
    return { error: "Giá trị booking không hợp lệ" };
  }
  const startDate = d.startDate ? new Date(d.startDate) : null;
  const endDate = d.endDate ? new Date(d.endDate) : null;
  if (startDate && endDate && endDate < startDate) {
    return { error: "Ngày kết thúc phải sau ngày bắt đầu" };
  }

  return {
    data: {
      name: d.name,
      brandName: d.brandName,
      source: d.source,
      brief: d.brief || null,
      contractValue,
      mmId: d.mmId,
      startDate,
      endDate,
      status: d.status,
      notes: d.notes || null,
      sourceUrl: d.sourceUrl || null,
    },
  };
}

// MM chỉ được đứng tên campaign của chính mình; system admin (Team Tech/Team Finance) gán cho MM bất kỳ.
async function assertMmAllowed(userRole: string, userId: string, mmId: string) {
  if (userRole === "MM" && mmId !== userId) {
    return "MM chỉ được tạo campaign cho chính mình";
  }
  const mm = await prisma.user.findUnique({ where: { id: mmId } });
  if (!mm || mm.role !== "MM") return "Người phụ trách phải có role MM";
  return null;
}

export async function createCampaign(formData: FormData) {
  const user = await requireRole("CFO", "TECH", "MM");
  const result = parseCampaignForm(formData);
  if ("error" in result) redirect(`/campaigns/new?error=${encodeURIComponent(result.error!)}`);

  const mmError = await assertMmAllowed(user.role, user.id, result.data!.mmId);
  if (mmError) redirect(`/campaigns/new?error=${encodeURIComponent(mmError)}`);

  const campaign = await prisma.campaign.create({ data: result.data! });
  await logAudit({
    userId: user.id,
    action: "CREATE",
    entity: "campaigns",
    entityId: campaign.id,
    detail: `Tạo campaign ${campaign.name} (${campaign.brandName})`,
  });
  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaign.id}`);
}

export async function updateCampaign(campaignId: string, formData: FormData) {
  const user = await requireRole("CFO", "TECH", "MM");
  const existing = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!existing) redirect("/campaigns");
  if (!canEditCampaign(user, existing.mmId)) redirect("/campaigns");

  const result = parseCampaignForm(formData);
  if ("error" in result)
    redirect(`/campaigns/${campaignId}?error=${encodeURIComponent(result.error!)}`);

  const mmError = await assertMmAllowed(user.role, user.id, result.data!.mmId);
  if (mmError) redirect(`/campaigns/${campaignId}?error=${encodeURIComponent(mmError)}`);

  await prisma.campaign.update({ where: { id: campaignId }, data: result.data! });
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "campaigns",
    entityId: campaignId,
    detail: `Cập nhật campaign ${result.data!.name}`,
  });
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}?saved=1`);
}

const assignSchema = z.object({
  talentId: z.string().min(1, "Chưa chọn Talent"),
  deadline: z.string().optional(),
  note: z.string().trim().optional(),
});

export async function assignTalent(campaignId: string, formData: FormData) {
  const user = await requireRole("CFO", "TECH", "MM");
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || !canEditCampaign(user, campaign.mmId)) redirect("/campaigns");

  const parsed = assignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(
      `/campaigns/${campaignId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ")}`,
    );
  }
  const d = parsed.data;

  // MM chỉ được giao cho Talent mình quản lý.
  const talent = await prisma.talent.findUnique({ where: { id: d.talentId } });
  if (!talent) redirect(`/campaigns/${campaignId}?error=${encodeURIComponent("Không tìm thấy Talent")}`);
  if (user.role === "MM" && talent.managerId !== user.id) {
    redirect(`/campaigns/${campaignId}?error=${encodeURIComponent("Chỉ giao được cho Talent bạn quản lý")}`);
  }

  const duplicate = await prisma.campaignAssignment.findUnique({
    where: { campaignId_talentId: { campaignId, talentId: d.talentId } },
  });
  if (duplicate) {
    redirect(`/campaigns/${campaignId}?error=${encodeURIComponent(`${talent.fullName} đã được giao campaign này`)}`);
  }

  const assignment = await prisma.campaignAssignment.create({
    data: {
      campaignId,
      talentId: d.talentId,
      assignedById: user.id,
      deadline: d.deadline ? new Date(d.deadline) : null,
      note: d.note || null,
    },
  });
  await logAudit({
    userId: user.id,
    action: "CREATE",
    entity: "campaign_assignments",
    entityId: assignment.id,
    detail: `Giao ${talent.fullName} vào campaign ${campaign.name}`,
  });
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}

export async function updateAssignmentStatus(assignmentId: string, status: AssignmentStatus) {
  const user = await requireRole("CFO", "TECH", "MM");
  const assignment = await prisma.campaignAssignment.findUnique({
    where: { id: assignmentId },
    include: { campaign: true, talent: true },
  });
  if (!assignment || !canEditCampaign(user, assignment.campaign.mmId)) redirect("/campaigns");

  await prisma.campaignAssignment.update({ where: { id: assignmentId }, data: { status } });
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "campaign_assignments",
    entityId: assignmentId,
    detail: `Đổi trạng thái giao việc của ${assignment.talent.fullName} thành ${status}`,
  });
  revalidatePath(`/campaigns/${assignment.campaignId}`);
  redirect(`/campaigns/${assignment.campaignId}`);
}

export async function removeAssignment(assignmentId: string) {
  const user = await requireRole("CFO", "TECH", "MM");
  const assignment = await prisma.campaignAssignment.findUnique({
    where: { id: assignmentId },
    include: { campaign: true, talent: true },
  });
  if (!assignment || !canEditCampaign(user, assignment.campaign.mmId)) redirect("/campaigns");

  await prisma.campaignAssignment.delete({ where: { id: assignmentId } });
  await logAudit({
    userId: user.id,
    action: "DELETE",
    entity: "campaign_assignments",
    entityId: assignmentId,
    detail: `Gỡ ${assignment.talent.fullName} khỏi campaign ${assignment.campaign.name}`,
  });
  revalidatePath(`/campaigns/${assignment.campaignId}`);
  redirect(`/campaigns/${assignment.campaignId}`);
}
