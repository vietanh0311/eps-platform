import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { createBookingDeal } from "@/server/actions/payroll";
import { BookingDealForm } from "@/components/booking-deal-form";

export default async function NewBookingDealPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRole("CFO");
  const { error } = await searchParams;

  const [managers, talents] = await Promise.all([
    prisma.user.findMany({ where: { role: "MM" }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    prisma.talent.findMany({ where: { status: "ACTIVE" }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Tạo booking deal</h1>
        <p className="text-sm text-muted-foreground">
          Chia lợi nhuận: mẫu 25% / MM 25% / công ty 25% / người bán deal 25%.
        </p>
      </div>
      {error ? (
        <p className="max-w-xl rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}
      {managers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có tài khoản MM nào.</p>
      ) : (
        <BookingDealForm action={createBookingDeal} managers={managers} talents={talents} submitLabel="Tạo deal" />
      )}
    </div>
  );
}
