"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireSystemAdmin } from "@/lib/authz";
import { computePayrollDraft } from "@/server/payroll/compute";
import type { Prisma } from "@/generated/prisma/client";

// Lương/thưởng (Module 3). Team Tech/Team Finance (system admin, quyền ngang nhau) tạo/duyệt/trả
// kỳ lương, đặt cơ chế Campaign, quản lý booking deal. Mọi action tự requireSystemAdmin lại.

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, "Định dạng tháng phải là YYYY-MM");

// ===== Kỳ lương =====

export async function createOrRecomputeDraft(formData: FormData) {
  const user = await requireSystemAdmin();
  const parsedMonth = monthSchema.safeParse(formData.get("month"));
  if (!parsedMonth.success) redirect(`/payroll?error=${encodeURIComponent(parsedMonth.error.issues[0]?.message ?? "Thiếu tháng")}`);
  const month = parsedMonth.data;

  let period = await prisma.payrollPeriod.findUnique({ where: { month } });
  if (period && period.status !== "DRAFT") {
    redirect(`/payroll/${period.id}?error=${encodeURIComponent("Kỳ lương đã duyệt/đã trả, không tính lại được")}`);
  }

  const draft = await computePayrollDraft(month);

  period ??= await prisma.payrollPeriod.create({ data: { month, status: "DRAFT" } });
  await prisma.payrollItem.deleteMany({ where: { periodId: period.id } });
  if (draft.items.length > 0) {
    await prisma.payrollItem.createMany({
      data: draft.items.map((i) => ({
        periodId: period.id,
        userId: i.userId ?? null,
        talentId: i.talentId ?? null,
        baseAmount: 0,
        bonusAmount: i.bonusAmount,
        total: i.bonusAmount,
        breakdown: i.breakdown as Prisma.InputJsonValue,
      })),
    });
  }

  await logAudit({
    userId: user.id,
    action: "CREATE",
    entity: "payroll_periods",
    entityId: period.id,
    detail: `Tính nháp kỳ lương ${month}: ${draft.items.length} dòng, ${draft.warnings.length} cảnh báo`,
  });
  revalidatePath("/payroll");
  revalidatePath(`/payroll/${period.id}`);
  const warningsParam = draft.warnings.length > 0 ? `?warnings=${encodeURIComponent(JSON.stringify(draft.warnings))}` : "";
  redirect(`/payroll/${period.id}${warningsParam}`);
}

export async function approvePeriod(periodId: string) {
  const user = await requireSystemAdmin();
  const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId }, include: { items: true } });
  if (!period) redirect("/payroll");
  if (period.status !== "DRAFT") redirect(`/payroll/${periodId}?error=${encodeURIComponent("Kỳ lương không ở trạng thái Nháp")}`);

  // Đánh dấu mốc thưởng tuyển dụng đã trả — chỉ làm lúc DUYỆT (không làm lúc tính nháp), để
  // recompute nhiều lần khi còn DRAFT không bị bỏ sót mốc (xem compute.ts).
  const now = new Date();
  for (const item of period.items) {
    const referrals = (item.breakdown as { referrals?: Array<{ talentId: string; milestone: 1 | 2 }> })?.referrals ?? [];
    for (const r of referrals) {
      await prisma.talent.update({
        where: { id: r.talentId },
        data: r.milestone === 1 ? { referralMilestone1PaidAt: now } : { referralMilestone2PaidAt: now },
      });
    }
  }

  await prisma.payrollPeriod.update({
    where: { id: periodId },
    data: { status: "APPROVED", approvedById: user.id, approvedAt: now },
  });
  await logAudit({ userId: user.id, action: "UPDATE", entity: "payroll_periods", entityId: periodId, detail: `Duyệt kỳ lương ${period.month}` });
  revalidatePath("/payroll");
  revalidatePath(`/payroll/${periodId}`);
  redirect(`/payroll/${periodId}?saved=1`);
}

export async function markPeriodPaid(periodId: string) {
  const user = await requireSystemAdmin();
  const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period) redirect("/payroll");
  if (period.status !== "APPROVED") redirect(`/payroll/${periodId}?error=${encodeURIComponent("Kỳ lương phải Đã duyệt mới đánh dấu Đã trả được")}`);

  await prisma.payrollPeriod.update({ where: { id: periodId }, data: { status: "PAID" } });
  await logAudit({ userId: user.id, action: "UPDATE", entity: "payroll_periods", entityId: periodId, detail: `Đánh dấu đã trả kỳ lương ${period.month}` });
  revalidatePath("/payroll");
  revalidatePath(`/payroll/${periodId}`);
  redirect(`/payroll/${periodId}?saved=1`);
}

// Mở lại kỳ lương (APPROVED hoặc PAID → DRAFT) khi cần sửa video thuộc tháng đó — CFO chốt cho
// phép mở lại cả kỳ Đã trả (PAID), không chỉ Đã duyệt. KHÔNG tự tính lại payroll_items — bấm nút
// "Tính nháp" (createOrRecomputeDraft) đã có sẵn sau khi sửa xong video, tránh mất dữ liệu nếu
// recompute xảy ra ngoài ý muốn giữa lúc đang sửa dở.
export async function reopenPeriod(periodId: string) {
  const user = await requireSystemAdmin();
  const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period) redirect("/payroll");
  if (period.status === "DRAFT") {
    redirect(`/payroll/${periodId}?error=${encodeURIComponent("Kỳ lương đang ở trạng thái Nháp rồi")}`);
  }

  await prisma.payrollPeriod.update({ where: { id: periodId }, data: { status: "DRAFT" } });
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "payroll_periods",
    entityId: periodId,
    detail: `Mở lại kỳ lương ${period.month} (từ ${period.status} về DRAFT) để sửa video`,
  });
  revalidatePath("/payroll");
  revalidatePath(`/payroll/${periodId}`);
  redirect(`/payroll/${periodId}?saved=1`);
}

// ===== Cơ chế Campaign (đồng/view, chi phí cố định/view, %chi phí max) =====

const rewardTermsSchema = z.object({
  pricePerView: z.string().trim().optional(),
  fixedCostPerView: z.string().trim().optional(),
  costCeilingPct: z.string().trim().optional(),
});

export async function upsertCampaignRewardTerms(campaignId: string, formData: FormData) {
  const user = await requireSystemAdmin();
  const parsed = rewardTermsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/campaigns/${campaignId}?error=${encodeURIComponent("Dữ liệu cơ chế không hợp lệ")}`);
  const d = parsed.data;

  const toInt = (v: string | undefined) => (v && v.trim() !== "" ? Number(v.replace(/\D/g, "")) : null);
  const pricePerView = toInt(d.pricePerView);
  const fixedCostPerView = toInt(d.fixedCostPerView);
  const costCeilingPct = toInt(d.costCeilingPct);
  if (costCeilingPct !== null && (costCeilingPct < 0 || costCeilingPct > 100)) {
    redirect(`/campaigns/${campaignId}?error=${encodeURIComponent("% chi phí max phải trong khoảng 0-100")}`);
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { pricePerView, fixedCostPerView, costCeilingPct } });
  await logAudit({ userId: user.id, action: "UPDATE", entity: "campaigns", entityId: campaignId, detail: "Cập nhật cơ chế thưởng (đồng/view, chi phí cố định/view, %chi phí max)" });
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}?saved=1`);
}

// ===== Booking deal =====

const bookingDealSchema = z.object({
  mmId: z.string().min(1, "Thiếu MM quản lý"),
  sellerId: z.string().trim().optional(),
  talentId: z.string().trim().optional(),
  brandName: z.string().trim().min(1, "Thiếu tên nhãn hàng"),
  castAmount: z.string().trim().min(1, "Thiếu giá trị deal"),
  dealMonth: monthSchema,
  note: z.string().trim().optional(),
});

function parseBookingDealForm(formData: FormData) {
  const parsed = bookingDealSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const d = parsed.data;
  const castAmount = Number(d.castAmount.replace(/\D/g, ""));
  if (!Number.isFinite(castAmount) || castAmount <= 0) return { error: "Giá trị deal không hợp lệ" };
  return {
    data: {
      mmId: d.mmId,
      sellerId: d.sellerId?.trim() || d.mmId, // mặc định người bán = MM quản lý
      talentId: d.talentId?.trim() || null,
      brandName: d.brandName,
      castAmount,
      dealMonth: d.dealMonth,
      note: d.note || null,
    },
  };
}

export async function createBookingDeal(formData: FormData) {
  const user = await requireSystemAdmin();
  const result = parseBookingDealForm(formData);
  if ("error" in result) redirect(`/booking/new?error=${encodeURIComponent(result.error!)}`);

  const deal = await prisma.bookingDeal.create({ data: { ...result.data!, createdById: user.id } });
  await logAudit({ userId: user.id, action: "CREATE", entity: "booking_deals", entityId: deal.id, detail: `Tạo booking deal ${deal.brandName} (${deal.castAmount}đ, ${deal.dealMonth})` });
  revalidatePath("/booking");
  redirect("/booking");
}

export async function updateBookingDeal(dealId: string, formData: FormData) {
  const user = await requireSystemAdmin();
  const result = parseBookingDealForm(formData);
  if ("error" in result) redirect(`/booking/${dealId}?error=${encodeURIComponent(result.error!)}`);

  await prisma.bookingDeal.update({ where: { id: dealId }, data: result.data! });
  await logAudit({ userId: user.id, action: "UPDATE", entity: "booking_deals", entityId: dealId, detail: `Cập nhật booking deal ${result.data!.brandName}` });
  revalidatePath("/booking");
  redirect("/booking");
}

export async function markBookingDealPaid(dealId: string) {
  const user = await requireSystemAdmin();
  const deal = await prisma.bookingDeal.findUnique({ where: { id: dealId } });
  if (!deal) redirect("/booking");

  await prisma.bookingDeal.update({ where: { id: dealId }, data: { paymentStatus: "PAID" } });
  await logAudit({ userId: user.id, action: "UPDATE", entity: "booking_deals", entityId: dealId, detail: `Đánh dấu đã trả booking deal ${deal.brandName}` });
  revalidatePath("/booking");
  redirect("/booking");
}

