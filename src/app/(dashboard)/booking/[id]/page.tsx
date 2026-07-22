import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { updateBookingDeal } from "@/server/actions/payroll";
import { BookingDealForm } from "@/components/booking-deal-form";

export default async function EditBookingDealPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  // Sửa deal là quyết định tài chính — chỉ CFO, giống các action payroll khác.
  await requireRole("CFO");
  const { id } = await params;
  const { error } = await searchParams;

  const [deal, managers, talents] = await Promise.all([
    prisma.bookingDeal.findUnique({ where: { id } }),
    prisma.user.findMany({ where: { role: "MM" }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    prisma.talent.findMany({ where: { status: "ACTIVE" }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
  ]);
  if (!deal) notFound();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Sửa booking deal</h1>
        <p className="text-sm text-muted-foreground">{deal.brandName}</p>
      </div>
      {error ? (
        <p className="max-w-xl rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}
      <BookingDealForm
        action={updateBookingDeal.bind(null, deal.id)}
        deal={deal}
        managers={managers}
        talents={talents}
        submitLabel="Lưu thay đổi"
      />
    </div>
  );
}
