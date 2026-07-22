"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { canEditPipeline, requireUser } from "@/lib/authz";
import { syncScalef } from "@/server/scalef/sync";

// Nút "Đồng bộ ngay" trên /scalef — gọi chung 1 hàm với cron launchd (scripts/sync-scalef.ts).
export async function syncScalefNow() {
  const user = await requireUser();
  if (!canEditPipeline(user)) redirect("/scalef");

  const result = await syncScalef();
  revalidatePath("/scalef");

  const qs = result.ok
    ? `synced=${result.itemsFound}`
    : `error=${encodeURIComponent(result.error ?? "Đồng bộ thất bại")}`;
  redirect(`/scalef?${qs}`);
}

// Ghép tay 1 scalef_video với 1 video nội bộ — dùng khi sync không tự gán được (hashtag trùng
// nhiều Talent, hoặc nhiều/không video ứng viên). videoId đến từ <select> trên form, không bind
// sẵn như scalefVideoId — cần đọc từ FormData.
export async function matchScalefVideo(scalefVideoId: string, formData: FormData) {
  const user = await requireUser();
  if (!canEditPipeline(user)) redirect("/scalef");

  const videoId = formData.get("videoId");
  if (typeof videoId !== "string" || !videoId) redirect("/scalef");

  const scalefVideo = await prisma.scalefVideo.findUnique({ where: { id: scalefVideoId } });
  if (!scalefVideo) redirect("/scalef");

  await prisma.scalefVideo.update({ where: { id: scalefVideoId }, data: { videoId } });
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "scalef_videos",
    entityId: scalefVideoId,
    detail: `Ghép tay với video nội bộ ${videoId}`,
  });
  revalidatePath("/scalef");
}

// Gỡ ghép nếu chọn nhầm — quay lại danh sách chưa khớp.
export async function unmatchScalefVideo(scalefVideoId: string) {
  const user = await requireUser();
  if (!canEditPipeline(user)) redirect("/scalef");

  await prisma.scalefVideo.update({ where: { id: scalefVideoId }, data: { videoId: null } });
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "scalef_videos",
    entityId: scalefVideoId,
    detail: "Gỡ ghép tay",
  });
  revalidatePath("/scalef");
}
