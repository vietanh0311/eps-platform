import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollPeriodScopeWhere, requireUser } from "@/lib/authz";
import { isSystemAdmin } from "@/lib/roles";
import { createOrRecomputeDraft } from "@/server/actions/payroll";
import { PAYROLL_PERIOD_STATUS_LABELS, formatVnd } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { error } = await searchParams;

  const periods = await prisma.payrollPeriod.findMany({
    where: payrollPeriodScopeWhere(user),
    include: {
      // MM chỉ thấy tổng phần của mình trong danh sách, không thấy tổng toàn kỳ.
      items: user.role === "MM" ? { where: { userId: user.id } } : true,
    },
    orderBy: { month: "desc" },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Lương & thưởng</h1>
        <p className="text-sm text-muted-foreground">
          {isSystemAdmin(user.role) ? "Toàn bộ kỳ lương trong hệ thống" : "Kỳ lương có phần của bạn"}
        </p>
      </div>

      {error ? (
        <p className="max-w-xl rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {isSystemAdmin(user.role) ? (
        <form action={createOrRecomputeDraft} className="flex items-end gap-3">
          <div className="grid gap-1">
            <Label htmlFor="month" className="text-xs">
              Tháng
            </Label>
            <Input id="month" name="month" type="month" required className="w-40" />
          </div>
          <Button type="submit">Tạo / tính lại nháp</Button>
        </form>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tháng</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">{user.role === "MM" ? "Số dòng của bạn" : "Số dòng"}</TableHead>
              <TableHead className="text-right">{user.role === "MM" ? "Của bạn" : "Tổng kỳ"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {periods.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Chưa có kỳ lương nào
                </TableCell>
              </TableRow>
            ) : (
              periods.map((p) => {
                const total = p.items.reduce((s, i) => s + i.total, 0);
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/payroll/${p.id}`} className="font-medium hover:underline">
                        {p.month}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === "PAID" ? "default" : "secondary"}>
                        {PAYROLL_PERIOD_STATUS_LABELS[p.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm">{p.items.length}</TableCell>
                    <TableCell className="text-right text-sm">{formatVnd(total)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
