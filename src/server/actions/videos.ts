"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import {
  canConfirmScalef,
  canEditPipeline,
  canLogVideoFor,
  canReviewVideo,
  requireRole,
  requireUser,
  type SessionUser,
} from "@/lib/authz";
import { isSystemAdmin } from "@/lib/roles";
import { isMonthLocked, monthKeyOf } from "@/server/payroll/compute";
import { detectPlatform, isHttpUrl, parseLinkList } from "@/lib/video-url";
import { PipelineStatus, ReviewStatus } from "@/generated/prisma/enums";

// Video thuộc kỳ lương đã duyệt/đã trả bị khóa sửa productionCost/airDate/campaignId với MM —
// system admin (Team Tech/Team Finance, quyền ngang nhau) luôn sửa được. Xem
// server/payroll/compute.ts (isMonthLocked) + server/actions/payroll.ts (reopenPeriod).
async function assertNotLocked(user: SessionUser, airDate: Date, errorRedirectTo: string) {
  if (isSystemAdmin(user.role)) return;
  if (await isMonthLocked(monthKeyOf(airDate))) {
    redirect(
      `${errorRedirectTo}?error=${encodeURIComponent("Kỳ lương tháng này đã duyệt — liên hệ Team Tech/Team Finance nếu cần sửa")}`,
    );
  }
}

// Log video hàng ngày. Video có 3 luồng trạng thái độc lập:
//   1. reviewStatus                — MM duyệt nội dung
//   2. pipelineStatus              — Tech chạy ads/tương tác rồi nộp ScaleF
//   3. scalefSubmitted/Confirmed   — Tech nộp lên ScaleF, MM check xác nhận lại
// Mỗi action tự kiểm tra quyền — gọi thẳng API cũng không vượt quyền được.

function refreshVideoViews(videoId: string) {
  revalidatePath("/videos");
  revalidatePath(`/videos/${videoId}`);
  revalidatePath("/");
}

// Lấy video kèm MM quản lý Talent — dùng cho mọi check quyền bên dưới.
async function loadVideoForAction(videoId: string) {
  return prisma.video.findUnique({
    where: { id: videoId },
    include: { talent: { select: { managerId: true, fullName: true } } },
  });
}

// ===== MM log video thay cho Talent =====

const createVideosSchema = z.object({
  talentId: z.string().min(1, "Chưa chọn Talent"),
  campaignId: z.string().optional(),
  airDate: z.string().min(1, "Thiếu ngày air"),
  links: z.string().min(1, "Chưa dán link video nào"),
  briefComment: z.string().trim().optional(),
  productionCost: z.string().trim().min(1, "Chưa điền chi phí sản xuất"),
});

export async function createVideos(formData: FormData) {
  const user = await requireRole("CFO", "TECH", "MM");
  const parsed = createVideosSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(
      `/videos/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ")}`,
    );
  }
  const d = parsed.data;

  const talent = await prisma.talent.findUnique({ where: { id: d.talentId } });
  if (!talent) redirect(`/videos/new?error=${encodeURIComponent("Không tìm thấy Talent")}`);
  if (!canLogVideoFor(user, talent.managerId)) {
    redirect(`/videos/new?error=${encodeURIComponent("Bạn chỉ log được video cho Talent mình quản lý")}`);
  }

  const links = parseLinkList(d.links);
  if (links.length === 0) redirect(`/videos/new?error=${encodeURIComponent("Chưa dán link video nào")}`);
  const invalid = links.find((l) => !isHttpUrl(l));
  if (invalid) {
    redirect(`/videos/new?error=${encodeURIComponent(`Link không hợp lệ: ${invalid.slice(0, 60)}`)}`);
  }

  // Campaign để trống vẫn log được (video ngoài campaign).
  let campaignId: string | null = null;
  if (d.campaignId) {
    const campaign = await prisma.campaign.findUnique({ where: { id: d.campaignId } });
    if (!campaign) redirect(`/videos/new?error=${encodeURIComponent("Campaign không tồn tại")}`);
    campaignId = campaign.id;
  }

  const cost = Number(d.productionCost.replace(/\D/g, ""));
  if (!Number.isFinite(cost) || cost < 0) {
    redirect(`/videos/new?error=${encodeURIComponent("Chi phí sản xuất không hợp lệ")}`);
  }

  const airDate = new Date(d.airDate);
  await assertNotLocked(user, airDate, "/videos/new");

  // Bỏ qua link đã có trong hệ thống để MM dán lại cả danh sách cũng không tạo trùng.
  const existing = await prisma.video.findMany({
    where: { videoUrl: { in: links } },
    select: { videoUrl: true },
  });
  const existingUrls = new Set(existing.map((v) => v.videoUrl));
  const fresh = links.filter((l) => !existingUrls.has(l));

  if (fresh.length === 0) {
    redirect(`/videos?error=${encodeURIComponent("Tất cả link đã có trong hệ thống, không tạo thêm")}`);
  }

  await prisma.video.createMany({
    data: fresh.map((url) => ({
      talentId: talent.id,
      campaignId,
      airDate,
      platform: detectPlatform(url),
      videoUrl: url,
      briefComment: d.briefComment || null,
      productionCost: cost,
      loggedById: user.id,
    })),
  });

  await logAudit({
    userId: user.id,
    action: "CREATE",
    entity: "videos",
    entityId: talent.id,
    detail: `Log ${fresh.length} video cho Talent ${talent.fullName}`,
  });
  revalidatePath("/videos");
  revalidatePath("/");
  redirect(`/videos?created=${fresh.length}&skipped=${links.length - fresh.length}`);
}

const updateVideoSchema = z.object({
  campaignId: z.string().optional(),
  airDate: z.string().min(1, "Thiếu ngày air"),
  briefComment: z.string().trim().optional(),
  feedback: z.string().trim().optional(),
  reviewStatus: z.enum(ReviewStatus),
  productionCost: z.string().trim().min(1, "Chưa điền chi phí sản xuất"),
});

export async function updateVideo(videoId: string, formData: FormData) {
  const user = await requireRole("CFO", "TECH", "MM");
  const video = await loadVideoForAction(videoId);
  if (!video) redirect("/videos");
  if (!canReviewVideo(user, video.talent.managerId)) redirect("/videos");

  const parsed = updateVideoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(
      `/videos/${videoId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ")}`,
    );
  }
  const d = parsed.data;
  const cost = Number(d.productionCost.replace(/\D/g, ""));
  if (!Number.isFinite(cost) || cost < 0) {
    redirect(`/videos/${videoId}?error=${encodeURIComponent("Chi phí sản xuất không hợp lệ")}`);
  }

  const newAirDate = new Date(d.airDate);
  // Khóa theo cả tháng hiện tại của video (đang thuộc kỳ đã duyệt) LẪN tháng mới nếu đổi airDate
  // sang tháng khác — tránh MM "né" khóa bằng cách dời ngày air.
  await assertNotLocked(user, video.airDate, `/videos/${videoId}`);
  await assertNotLocked(user, newAirDate, `/videos/${videoId}`);

  await prisma.video.update({
    where: { id: videoId },
    data: {
      campaignId: d.campaignId || null,
      airDate: newAirDate,
      briefComment: d.briefComment || null,
      feedback: d.feedback || null,
      reviewStatus: d.reviewStatus,
      productionCost: cost,
    },
  });
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "videos",
    entityId: videoId,
    detail: `Cập nhật video của ${video.talent.fullName} (duyệt: ${d.reviewStatus})`,
  });
  refreshVideoViews(videoId);
  redirect(`/videos/${videoId}?saved=1`);
}

// Điền nhanh 1 giá cho nhiều video "chưa có chi phí" cùng lúc (màn /videos?cost=missing) — bỏ qua
// (không lỗi cả loạt) video người dùng không có quyền sửa hoặc đang thuộc kỳ lương đã khóa.
const bulkCostSchema = z.object({
  productionCost: z.string().trim().min(1, "Chưa điền chi phí sản xuất"),
});

export async function bulkSetProductionCost(formData: FormData) {
  const user = await requireRole("CFO", "TECH", "MM");
  const videoIds = formData.getAll("videoIds").map(String).filter(Boolean);
  if (videoIds.length === 0) {
    redirect(`/videos?cost=missing&error=${encodeURIComponent("Chưa chọn video nào")}`);
  }

  const parsed = bulkCostSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/videos?cost=missing&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ")}`);
  }
  const cost = Number(parsed.data.productionCost.replace(/\D/g, ""));
  if (!Number.isFinite(cost) || cost < 0) {
    redirect(`/videos?cost=missing&error=${encodeURIComponent("Chi phí sản xuất không hợp lệ")}`);
  }

  const videos = await prisma.video.findMany({
    where: { id: { in: videoIds } },
    select: { id: true, airDate: true, talent: { select: { managerId: true } } },
  });

  const admin = isSystemAdmin(user.role);
  const updatableIds: string[] = [];
  for (const v of videos) {
    if (!canReviewVideo(user, v.talent.managerId)) continue;
    if (!admin && (await isMonthLocked(monthKeyOf(v.airDate)))) continue;
    updatableIds.push(v.id);
  }

  if (updatableIds.length > 0) {
    await prisma.video.updateMany({ where: { id: { in: updatableIds } }, data: { productionCost: cost } });
  }
  const skipped = videoIds.length - updatableIds.length;

  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "videos",
    entityId: "bulk",
    detail: `Điền nhanh chi phí ${cost}đ cho ${updatableIds.length} video (bỏ qua ${skipped} video đã khóa/không có quyền)`,
  });
  revalidatePath("/videos");
  revalidatePath("/");
  redirect(`/videos?cost=missing&bulkUpdated=${updatableIds.length}&bulkSkipped=${skipped}`);
}

export async function deleteVideo(videoId: string) {
  const user = await requireRole("CFO", "TECH", "MM");
  const video = await loadVideoForAction(videoId);
  if (!video) redirect("/videos");
  if (!canReviewVideo(user, video.talent.managerId)) redirect("/videos");
  await assertNotLocked(user, video.airDate, `/videos/${videoId}`);

  await prisma.video.delete({ where: { id: videoId } });
  await logAudit({
    userId: user.id,
    action: "DELETE",
    entity: "videos",
    entityId: videoId,
    detail: `Xóa video ${video.videoUrl} của ${video.talent.fullName}`,
  });
  revalidatePath("/videos");
  revalidatePath("/");
  redirect("/videos");
}

// ===== Team Tech: pipeline =====

// Ghi lịch sử mỗi lần đổi bước để biết ai làm lúc nào (nguồn số liệu "video chậm tiến độ").
async function applyPipelineChange(params: {
  user: SessionUser;
  videoId: string;
  from: PipelineStatus;
  to: PipelineStatus;
  note?: string | null;
  extraVideoData?: Record<string, unknown>;
}) {
  const { user, videoId, from, to, note, extraVideoData } = params;
  await prisma.$transaction([
    prisma.video.update({
      where: { id: videoId },
      data: { pipelineStatus: to, ...(extraVideoData ?? {}) },
    }),
    prisma.videoPipelineEvent.create({
      data: { videoId, fromStatus: from, toStatus: to, byUserId: user.id, note: note || null },
    }),
  ]);
}

export async function advancePipeline(
  videoId: string,
  toStatus: PipelineStatus,
  formData?: FormData,
) {
  const user = await requireUser();
  if (!canEditPipeline(user)) redirect("/videos");

  const video = await loadVideoForAction(videoId);
  if (!video) redirect("/videos");

  // Bước "Đã gửi ScaleF" đi qua submitToScalef để luôn ghi kèm ai/lúc nào đã nộp.
  if (toStatus === "SENT_SCALEF") {
    redirect(`/videos/${videoId}?error=${encodeURIComponent('Dùng nút "Nộp lên ScaleF" cho bước này')}`);
  }
  if (video.pipelineStatus === toStatus) {
    refreshVideoViews(videoId);
    return;
  }

  await applyPipelineChange({
    user,
    videoId,
    from: video.pipelineStatus,
    to: toStatus,
    note: formData ? String(formData.get("note") ?? "") : null,
  });
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "videos",
    entityId: videoId,
    detail: `Pipeline: ${video.pipelineStatus} → ${toStatus} (${video.talent.fullName})`,
  });
  refreshVideoViews(videoId);
}

// ===== Nộp ScaleF (Tech) và xác nhận (MM) =====

export async function submitToScalef(videoId: string) {
  const user = await requireUser();
  if (!canEditPipeline(user)) redirect("/videos");

  const video = await loadVideoForAction(videoId);
  if (!video) redirect("/videos");
  if (video.scalefSubmittedAt) {
    refreshVideoViews(videoId);
    return;
  }

  await applyPipelineChange({
    user,
    videoId,
    from: video.pipelineStatus,
    to: "SENT_SCALEF",
    note: "Nộp lên hệ thống ScaleF",
    extraVideoData: { scalefSubmittedById: user.id, scalefSubmittedAt: new Date() },
  });
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "videos",
    entityId: videoId,
    detail: `Nộp lên ScaleF video của ${video.talent.fullName}`,
  });
  refreshVideoViews(videoId);
}

export async function undoSubmitToScalef(videoId: string) {
  const user = await requireUser();
  if (!canEditPipeline(user)) redirect("/videos");

  const video = await loadVideoForAction(videoId);
  if (!video || !video.scalefSubmittedAt) {
    refreshVideoViews(videoId);
    return;
  }

  // Trả pipeline về đúng bước trước khi nộp (đọc từ lịch sử, không đoán).
  const lastSubmit = await prisma.videoPipelineEvent.findFirst({
    where: { videoId, toStatus: "SENT_SCALEF" },
    orderBy: { at: "desc" },
  });
  const revertTo: PipelineStatus = lastSubmit?.fromStatus ?? "ENGAGEMENT_DONE";

  await applyPipelineChange({
    user,
    videoId,
    from: video.pipelineStatus,
    to: revertTo,
    note: "Gỡ trạng thái đã nộp ScaleF",
    // Gỡ nộp thì xác nhận của MM cũng không còn đúng nữa — xóa luôn để 2 cột không mâu thuẫn.
    extraVideoData: {
      scalefSubmittedById: null,
      scalefSubmittedAt: null,
      scalefConfirmedById: null,
      scalefConfirmedAt: null,
    },
  });
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "videos",
    entityId: videoId,
    detail: `Gỡ trạng thái đã nộp ScaleF video của ${video.talent.fullName}`,
  });
  refreshVideoViews(videoId);
}

export async function confirmScalefSubmission(videoId: string) {
  const user = await requireRole("CFO", "TECH", "MM");
  const video = await loadVideoForAction(videoId);
  if (!video) redirect("/videos");
  if (!canConfirmScalef(user, video.talent.managerId)) redirect("/videos");

  // Chưa nộp thì không có gì để xác nhận.
  if (!video.scalefSubmittedAt) {
    redirect(`/videos?error=${encodeURIComponent("Tech chưa nộp video này lên ScaleF nên chưa xác nhận được")}`);
  }
  if (video.scalefConfirmedAt) {
    refreshVideoViews(videoId);
    return;
  }

  await prisma.video.update({
    where: { id: videoId },
    data: { scalefConfirmedById: user.id, scalefConfirmedAt: new Date() },
  });
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "videos",
    entityId: videoId,
    detail: `Xác nhận đã nộp ScaleF video của ${video.talent.fullName}`,
  });
  refreshVideoViews(videoId);
}

export async function undoConfirmScalef(videoId: string) {
  const user = await requireRole("CFO", "TECH", "MM");
  const video = await loadVideoForAction(videoId);
  if (!video) redirect("/videos");
  if (!canConfirmScalef(user, video.talent.managerId)) redirect("/videos");

  await prisma.video.update({
    where: { id: videoId },
    data: { scalefConfirmedById: null, scalefConfirmedAt: null },
  });
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "videos",
    entityId: videoId,
    detail: `Bỏ xác nhận nộp ScaleF video của ${video.talent.fullName}`,
  });
  refreshVideoViews(videoId);
}
