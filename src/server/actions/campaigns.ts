"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import {
  canEditCampaign,
  canJoinCampaignManager,
  canRemoveCampaignManager,
  requireRole,
  requireSystemAdmin,
} from "@/lib/authz";
import { syncAmbassadorCampaigns } from "@/server/ambassador/sync";
import { AssignmentStatus, CampaignSource, CampaignStatus } from "@/generated/prisma/enums";

// Campaign/Brief — MM nhận brief và giao việc cho Talent mình quản lý.
// Mọi action tự kiểm tra quyền lại (proxy chỉ là lớp chặn ngoài).

const campaignSchema = z.object({
  name: z.string().trim().min(1, "Thiếu tên campaign"),
  brandName: z.string().trim().min(1, "Thiếu tên nhãn hàng"),
  source: z.enum(CampaignSource),
  brief: z.string().trim().optional(),
  contractValue: z.string().trim().optional(),
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

// Chỉ dùng lúc TẠO MỚI — campaign luôn có ít nhất 1 MM khởi tạo. Thêm MM thứ 2 trở đi (Vấn đề 2)
// làm ở mục riêng "MM phụ trách" trên trang chi tiết (joinCampaignManager), không qua form chung.
export async function createCampaign(formData: FormData) {
  const user = await requireRole("CFO", "TECH", "MM");
  const result = parseCampaignForm(formData);
  if ("error" in result) redirect(`/campaigns/new?error=${encodeURIComponent(result.error!)}`);

  const mmId = formData.get("mmId");
  if (typeof mmId !== "string" || !mmId) {
    redirect(`/campaigns/new?error=${encodeURIComponent("Thiếu MM phụ trách")}`);
  }
  const mmError = await assertMmAllowed(user.role, user.id, mmId as string);
  if (mmError) redirect(`/campaigns/new?error=${encodeURIComponent(mmError)}`);

  const campaign = await prisma.campaign.create({
    data: { ...result.data!, managers: { create: { userId: mmId as string } } },
  });
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
  const existing = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { managers: true },
  });
  if (!existing) redirect("/campaigns");
  if (!canEditCampaign(user, existing.managers.map((m) => m.userId), existing.mergedIntoId))
    redirect("/campaigns");

  const result = parseCampaignForm(formData);
  if ("error" in result)
    redirect(`/campaigns/${campaignId}?error=${encodeURIComponent(result.error!)}`);

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
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { managers: true },
  });
  if (!campaign || !canEditCampaign(user, campaign.managers.map((m) => m.userId), campaign.mergedIntoId))
    redirect("/campaigns");

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
    include: { campaign: { include: { managers: true } }, talent: true },
  });
  if (
    !assignment ||
    !canEditCampaign(user, assignment.campaign.managers.map((m) => m.userId), assignment.campaign.mergedIntoId)
  )
    redirect("/campaigns");

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
    include: { campaign: { include: { managers: true } }, talent: true },
  });
  if (
    !assignment ||
    !canEditCampaign(user, assignment.campaign.managers.map((m) => m.userId), assignment.campaign.mergedIntoId)
  )
    redirect("/campaigns");

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

// ===== Đồng bộ Campaign từ Ambassador =====

// Nút "Đồng bộ ngay" trên /campaigns — gọi chung 1 hàm với cron (scripts/sync-ambassador.ts).
// Không sửa dữ liệu người khác nên an toàn cho cả MM bấm.
export async function syncAmbassadorNow() {
  await requireRole("CFO", "TECH", "MM");
  const result = await syncAmbassadorCampaigns("MANUAL");
  revalidatePath("/campaigns");

  const qs = result.ok
    ? `synced=${result.itemsFound}`
    : `error=${encodeURIComponent(result.error ?? "Đồng bộ thất bại")}`;
  redirect(`/campaigns?${qs}`);
}

// Vấn đề 2 — thêm 1 MM vào danh sách đồng phụ trách campaign. MM tự thêm chính mình (tự phục vụ,
// giống "Nhận" cũ — CFO xác nhận không cần duyệt); system admin thêm được bất kỳ MM nào qua
// <select> trên form (thay MM khác hoặc bổ sung người thứ 2 trở lên). Không giới hạn số MM, không
// yêu cầu campaign đang trống mới thêm được.
export async function joinCampaignManager(campaignId: string, formData: FormData) {
  const user = await requireRole("CFO", "TECH", "MM");
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) redirect("/campaigns");

  let targetUserId: string;
  if (user.role === "MM") {
    targetUserId = user.id;
  } else {
    const selected = formData.get("mmId");
    if (typeof selected !== "string" || !selected) {
      redirect(`/campaigns/${campaignId}?error=${encodeURIComponent("Chưa chọn MM")}`);
    }
    targetUserId = selected as string;
  }
  if (!canJoinCampaignManager(user, targetUserId, campaign)) redirect(`/campaigns/${campaignId}`);

  const mm = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!mm || mm.role !== "MM") {
    redirect(`/campaigns/${campaignId}?error=${encodeURIComponent("Người được chọn phải có role MM")}`);
  }
  const already = await prisma.campaignManager.findUnique({
    where: { campaignId_userId: { campaignId, userId: targetUserId } },
  });
  if (already) redirect(`/campaigns/${campaignId}?error=${encodeURIComponent(`${mm!.fullName} đã phụ trách campaign này`)}`);

  await prisma.campaignManager.create({ data: { campaignId, userId: targetUserId } });
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "campaigns",
    entityId: campaignId,
    detail: `${mm!.fullName} cùng phụ trách campaign ${campaign.name}`,
  });
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}

// Vấn đề 2 — gỡ 1 MM khỏi danh sách đồng phụ trách. Chỉ system admin (CFO xác nhận qua Plan Mode
// — việc nhạy cảm hơn tự thêm). Không đụng video/lương lịch sử của MM đó, chỉ mất quyền sửa
// brief/giao Talent tiếp theo cho campaign này.
export async function removeCampaignManager(campaignId: string, userId: string) {
  const user = await requireSystemAdmin();
  if (!canRemoveCampaignManager(user)) redirect(`/campaigns/${campaignId}`);

  const manager = await prisma.campaignManager.findUnique({
    where: { campaignId_userId: { campaignId, userId } },
    include: { campaign: true, user: true },
  });
  if (!manager) redirect(`/campaigns/${campaignId}`);

  await prisma.campaignManager.delete({ where: { id: manager.id } });
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "campaigns",
    entityId: campaignId,
    detail: `Gỡ ${manager.user.fullName} khỏi campaign ${manager.campaign.name}`,
  });
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}

// ===== Vấn đề 3 — Duyệt tay campaign MANUAL ↔ AMBASSADOR nghi ngờ trùng (/campaigns/matching) =====
// Chỉ system admin: đụng dữ liệu vận hành + cơ chế lương (cùng mức quyền với đặt pricePerView).
// Không tự động khớp/gộp — mọi merge do người dùng bấm tay từng cặp, xem
// src/server/campaigns/matching.ts để biết cách phát hiện cặp nghi ngờ.

// "Bỏ qua" — ghi nhận cặp không phải cùng đợt, không hỏi lại (đọc lại ở findMatchCandidates()).
export async function dismissCampaignMatch(manualId: string, ambassadorId: string) {
  const user = await requireSystemAdmin();
  await logAudit({
    userId: user.id,
    action: "DISMISS",
    entity: "campaign_match",
    entityId: `${manualId}:${ambassadorId}`,
    detail: "Bỏ qua gợi ý trùng campaign — xác nhận không phải cùng đợt",
  });
  revalidatePath("/campaigns/matching");
  redirect("/campaigns/matching");
}

// "Gộp" — chuyển toàn bộ assignment/video/expense từ campaign MANUAL sang campaign AMBASSADOR
// được chọn, mang theo cơ chế giá (chỉ khi đích chưa có, không ghi đè) VÀ toàn bộ MM đồng phụ
// trách (union, an toàn tuyệt đối vì chỉ cộng thêm — Vấn đề 2 đổi Campaign sang nhiều-nhiều nên
// không còn rủi ro ghi đè như mmId đơn trước đây, bỏ hẳn checkbox "mang MM cũ sang"), đánh dấu
// MANUAL đã gộp (mergedIntoId) — KHÔNG xóa, để tra cứu lịch sử. Không tách được 1 MANUAL vào
// nhiều AMBASSADOR (xem plan) — sửa tay từng video ở /videos/[id] nếu cần trường hợp đó.
export async function mergeCampaign(manualId: string, ambassadorId: string) {
  const user = await requireSystemAdmin();

  const [manual, ambassador] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: manualId }, include: { managers: true } }),
    prisma.campaign.findUnique({ where: { id: ambassadorId }, include: { managers: true } }),
  ]);
  if (
    !manual ||
    !ambassador ||
    manual.mergedIntoId ||
    ambassador.mergedIntoId ||
    manual.source !== "MANUAL" ||
    ambassador.source !== "AMBASSADOR"
  ) {
    redirect(`/campaigns/matching?error=${encodeURIComponent("Cặp campaign không hợp lệ để gộp")}`);
  }

  const [manualAssignments, ambassadorAssignments, videoCount] = await Promise.all([
    prisma.campaignAssignment.findMany({ where: { campaignId: manualId }, select: { id: true, talentId: true } }),
    prisma.campaignAssignment.findMany({ where: { campaignId: ambassadorId }, select: { talentId: true } }),
    prisma.video.count({ where: { campaignId: manualId } }),
  ]);
  const ambassadorTalentIds = new Set(ambassadorAssignments.map((a) => a.talentId));
  // Talent đã được giao ở CẢ HAI campaign — xóa bản MANUAL trước khi update để không đụng unique
  // (campaignId, talentId); bản AMBASSADOR đã có sẵn coi như đủ, không cần merge 2 dòng.
  const duplicateAssignmentIds = manualAssignments.filter((a) => ambassadorTalentIds.has(a.talentId)).map((a) => a.id);
  const movedAssignmentCount = manualAssignments.length - duplicateAssignmentIds.length;

  // Cơ chế giá: chỉ mang theo khi campaign đích CHƯA đặt riêng — không ghi đè giá trị CFO đã chốt.
  const rewardData: { pricePerView?: number; fixedCostPerView?: number; costCeilingPct?: number } = {};
  if (ambassador.pricePerView == null && manual.pricePerView != null) rewardData.pricePerView = manual.pricePerView;
  if (ambassador.fixedCostPerView == null && manual.fixedCostPerView != null)
    rewardData.fixedCostPerView = manual.fixedCostPerView;
  if (ambassador.costCeilingPct == null && manual.costCeilingPct != null)
    rewardData.costCeilingPct = manual.costCeilingPct;

  // MM đồng phụ trách: union — thêm những MM của MANUAL mà đích chưa có, không đụng ai đã có sẵn.
  const ambassadorManagerIds = new Set(ambassador.managers.map((m) => m.userId));
  const managersToAdd = manual.managers.filter((m) => !ambassadorManagerIds.has(m.userId));

  await prisma.$transaction([
    prisma.campaignAssignment.deleteMany({ where: { id: { in: duplicateAssignmentIds } } }),
    prisma.campaignAssignment.updateMany({ where: { campaignId: manualId }, data: { campaignId: ambassadorId } }),
    prisma.video.updateMany({ where: { campaignId: manualId }, data: { campaignId: ambassadorId } }),
    prisma.expense.updateMany({ where: { campaignId: manualId }, data: { campaignId: ambassadorId } }),
    prisma.campaign.update({ where: { id: ambassadorId }, data: rewardData }),
    prisma.campaignManager.createMany({
      data: managersToAdd.map((m) => ({ campaignId: ambassadorId, userId: m.userId })),
      skipDuplicates: true,
    }),
    prisma.campaign.update({ where: { id: manualId }, data: { mergedIntoId: ambassadorId } }),
  ]);

  await logAudit({
    userId: user.id,
    action: "MERGE",
    entity: "campaigns",
    entityId: manualId,
    detail: `Gộp "${manual.name}" vào "${ambassador.name}": ${videoCount} video, ${movedAssignmentCount} assignment chuyển (${duplicateAssignmentIds.length} trùng bị bỏ), ${managersToAdd.length} MM mang sang`,
  });
  revalidatePath("/campaigns");
  revalidatePath("/campaigns/matching");
  revalidatePath(`/campaigns/${ambassadorId}`);
  redirect(`/campaigns/${ambassadorId}?merged=1`);
}

// ===== Vấn đề 1 — Liên kết Campaign ↔ ScaleF Event, đề xuất pricePerView (/campaigns/scalef-policy) =====
// Chỉ system admin (cùng mức quyền upsertCampaignRewardTerms — đụng dữ liệu lương). Không tự động
// khớp/áp dụng — CFO/Tech tự xem và quyết định từng cặp, xem src/server/campaigns/scalef-policy.ts.

// "Bỏ qua" — ghi nhận cặp không phải cùng campaign thật, không hỏi lại.
export async function dismissScalefPolicyMatch(campaignId: string, scalefEventId: string) {
  const user = await requireSystemAdmin();
  await logAudit({
    userId: user.id,
    action: "DISMISS",
    entity: "campaign_scalef_match",
    entityId: `${campaignId}:${scalefEventId}`,
    detail: "Bỏ qua gợi ý khớp ScaleF event — xác nhận không phải cùng campaign",
  });
  revalidatePath("/campaigns/scalef-policy");
  redirect("/campaigns/scalef-policy");
}

// "Liên kết" — gắn campaign với đúng ScaleF event thật. Nếu form có applyPrice (chỉ gửi khi CFO
// bấm "Liên kết & áp dụng giá" trên gợi ý per_view) VÀ campaign chưa có pricePerView riêng, cập
// nhật thêm pricePerView trong CÙNG 1 lần update — KHÔNG bao giờ ghi đè giá CFO đã tự điền, và
// KHÔNG đụng fixedCostPerView/costCeilingPct (khác upsertCampaignRewardTerms, action đó ghi đè cả
// 3 field cùng lúc nên không dùng lại được ở đây).
export async function linkScalefEvent(campaignId: string, scalefEventId: string, formData: FormData) {
  const user = await requireSystemAdmin();

  const [campaign, event, occupied] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: campaignId } }),
    prisma.scalefEvent.findUnique({ where: { id: scalefEventId } }),
    prisma.campaign.findUnique({ where: { scalefEventId } }),
  ]);
  if (!campaign || !event) redirect("/campaigns/scalef-policy");
  if (campaign.scalefEventId || campaign.mergedIntoId) {
    redirect(`/campaigns/scalef-policy?error=${encodeURIComponent("Campaign đã liên kết hoặc đã gộp")}`);
  }
  if (occupied) {
    redirect(`/campaigns/scalef-policy?error=${encodeURIComponent("ScaleF event này đã liên kết với campaign khác")}`);
  }

  const applyPriceRaw = formData.get("applyPrice");
  const data: { scalefEventId: string; pricePerView?: number } = { scalefEventId };
  if (campaign.pricePerView == null && typeof applyPriceRaw === "string" && applyPriceRaw.trim()) {
    const n = Number(applyPriceRaw.replace(/\D/g, ""));
    if (Number.isFinite(n) && n > 0) data.pricePerView = n;
  }

  await prisma.campaign.update({ where: { id: campaignId }, data });
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "campaigns",
    entityId: campaignId,
    detail: `Liên kết campaign ${campaign.name} với ScaleF event ${event.name}${data.pricePerView ? `, áp dụng pricePerView=${data.pricePerView}` : ""}`,
  });
  revalidatePath("/campaigns");
  revalidatePath("/campaigns/scalef-policy");
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}

// Gỡ liên kết — sửa nhầm campaign, hoặc campaign đó thật ra không chạy qua ScaleF. Không đụng
// pricePerView đã áp dụng trước đó (nếu có) — chỉ gỡ đường link tra cứu.
export async function unlinkScalefEvent(campaignId: string) {
  const user = await requireSystemAdmin();
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || !campaign.scalefEventId) redirect("/campaigns/scalef-policy");

  await prisma.campaign.update({ where: { id: campaignId }, data: { scalefEventId: null } });
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "campaigns",
    entityId: campaignId,
    detail: `Gỡ liên kết ScaleF event khỏi campaign ${campaign.name}`,
  });
  revalidatePath("/campaigns/scalef-policy");
  redirect("/campaigns/scalef-policy");
}
