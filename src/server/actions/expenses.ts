"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireSystemAdmin } from "@/lib/authz";
import { formatVnd } from "@/lib/labels";

// Chi phí (Module 6) — Team Tech/Team Finance (system admin, quyền ngang nhau) tạo/sửa/xóa, không
// phân biệt người tạo (đúng triết lý requireSystemAdmin, xem canManageExpenses trong authz.ts).

const expenseSchema = z.object({
  category: z.enum(["ADS", "PRODUCTION", "SALARY", "OTHER"]),
  amount: z.coerce.number().int().positive("Số tiền phải lớn hơn 0"),
  incurredAt: z.iso.date("Thiếu ngày phát sinh"),
  campaignId: z.string().optional(),
  videoUrl: z.string().optional(),
  note: z.string().optional(),
});

// Video gắn theo link dán tay (giống pattern nộp video ở /videos/new) thay vì <select> 317 dòng —
// chưa có combobox trong src/components/ui/, giữ v1 đơn giản. Dùng lại chỉ mục videoUrl có sẵn.
async function resolveVideoId(videoUrl: string | undefined): Promise<{ videoId: string | null; error?: string }> {
  const trimmed = videoUrl?.trim();
  if (!trimmed) return { videoId: null };
  const video = await prisma.video.findFirst({ where: { videoUrl: trimmed }, select: { id: true } });
  if (!video) return { videoId: null, error: `Không tìm thấy video với link "${trimmed}" — để trống nếu chi phí không gắn video cụ thể.` };
  return { videoId: video.id };
}

export async function createExpense(formData: FormData) {
  const user = await requireSystemAdmin();
  const parsed = expenseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/expenses?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ")}`);
  }
  const data = parsed.data;

  const { videoId, error: videoError } = await resolveVideoId(data.videoUrl);
  if (videoError) redirect(`/expenses?error=${encodeURIComponent(videoError)}`);

  const expense = await prisma.expense.create({
    data: {
      category: data.category,
      amount: data.amount,
      incurredAt: new Date(data.incurredAt),
      campaignId: data.campaignId || null,
      videoId,
      note: data.note || null,
      createdById: user.id,
    },
  });

  await logAudit({
    userId: user.id,
    action: "CREATE",
    entity: "expenses",
    entityId: expense.id,
    detail: `Thêm chi phí ${data.category} ${formatVnd(data.amount)}`,
  });
  revalidatePath("/expenses");
  revalidatePath("/");
  redirect("/expenses");
}

export async function updateExpense(expenseId: string, formData: FormData) {
  const user = await requireSystemAdmin();
  const existing = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!existing) redirect("/expenses");

  const parsed = expenseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/expenses?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ")}`);
  }
  const data = parsed.data;

  const { videoId, error: videoError } = await resolveVideoId(data.videoUrl);
  if (videoError) redirect(`/expenses?error=${encodeURIComponent(videoError)}`);

  await prisma.expense.update({
    where: { id: expenseId },
    data: {
      category: data.category,
      amount: data.amount,
      incurredAt: new Date(data.incurredAt),
      campaignId: data.campaignId || null,
      videoId,
      note: data.note || null,
    },
  });

  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "expenses",
    entityId: expenseId,
    detail: `Sửa chi phí ${data.category} ${formatVnd(data.amount)}`,
  });
  revalidatePath("/expenses");
  revalidatePath("/");
  redirect("/expenses");
}

export async function deleteExpense(expenseId: string) {
  const user = await requireSystemAdmin();
  const existing = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!existing) redirect("/expenses");

  await prisma.expense.delete({ where: { id: expenseId } });
  await logAudit({
    userId: user.id,
    action: "DELETE",
    entity: "expenses",
    entityId: expenseId,
    detail: `Xóa chi phí ${existing.category} ${formatVnd(existing.amount)}`,
  });
  revalidatePath("/expenses");
  revalidatePath("/");
  redirect("/expenses");
}
