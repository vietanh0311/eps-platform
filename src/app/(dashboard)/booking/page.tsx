import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { isSystemAdmin } from "@/lib/roles";
import { markBookingDealPaid } from "@/server/actions/payroll";
import { PAYMENT_STATUS_LABELS, formatVnd } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Prisma } from "@/generated/prisma/client";

export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { error } = await searchParams;

  const where: Prisma.BookingDealWhereInput =
    isSystemAdmin(user.role) ? {} : user.role === "MM" ? { OR: [{ mmId: user.id }, { sellerId: user.id }] } : { id: "__none__" };

  const deals = await prisma.bookingDeal.findMany({
    where,
    include: { mm: true, seller: true, talent: true },
    orderBy: [{ dealMonth: "desc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Booking</h1>
          <p className="text-sm text-muted-foreground">
            Deal booking — chia mẫu 25% / MM 25% / công ty 25% / người bán deal 25%.
          </p>
        </div>
        {isSystemAdmin(user.role) ? (
          <Button asChild>
            <Link href="/booking/new">+ Tạo deal</Link>
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="max-w-xl rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tháng</TableHead>
              <TableHead>Nhãn hàng</TableHead>
              <TableHead>Mẫu</TableHead>
              <TableHead>MM quản lý</TableHead>
              <TableHead>Người bán deal</TableHead>
              <TableHead className="text-right">Giá trị deal</TableHead>
              <TableHead>Thanh toán</TableHead>
              {isSystemAdmin(user.role) ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {deals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isSystemAdmin(user.role) ? 8 : 7} className="py-8 text-center text-muted-foreground">
                  Chưa có deal nào
                </TableCell>
              </TableRow>
            ) : (
              deals.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="text-sm">{d.dealMonth}</TableCell>
                  <TableCell>
                    {isSystemAdmin(user.role) ? (
                      <Link href={`/booking/${d.id}`} className="font-medium hover:underline">
                        {d.brandName}
                      </Link>
                    ) : (
                      <span className="font-medium">{d.brandName}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{d.talent?.fullName ?? "—"}</TableCell>
                  <TableCell className="text-sm">{d.mm.fullName}</TableCell>
                  <TableCell className="text-sm">{d.seller.fullName}</TableCell>
                  <TableCell className="text-right text-sm">{formatVnd(d.castAmount)}</TableCell>
                  <TableCell>
                    <Badge variant={d.paymentStatus === "PAID" ? "default" : "secondary"}>
                      {PAYMENT_STATUS_LABELS[d.paymentStatus]}
                    </Badge>
                  </TableCell>
                  {isSystemAdmin(user.role) ? (
                    <TableCell className="text-right">
                      {d.paymentStatus === "PENDING" ? (
                        <form action={markBookingDealPaid.bind(null, d.id)}>
                          <Button type="submit" size="sm" variant="outline">
                            Đánh dấu đã trả
                          </Button>
                        </form>
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
