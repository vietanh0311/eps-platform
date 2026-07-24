import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSystemAdmin } from "@/lib/authz";
import { createExpense } from "@/server/actions/expenses";
import { ExpenseForm } from "@/components/expense-form";
import { EXPENSE_CATEGORY_LABELS, formatDate, formatVnd } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Chi phí ads/lương/khác (Module 6) — nguồn chi phí dashboard lợi nhuận bên cạnh
// Video.productionCost (chi phí sản xuất, đã có từ Module 2) và PayrollItem (Module 3).
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireSystemAdmin();
  const { error } = await searchParams;

  const [expenses, campaigns] = await Promise.all([
    prisma.expense.findMany({
      include: { campaign: { select: { name: true } }, video: { select: { videoUrl: true } }, createdBy: { select: { fullName: true } } },
      orderBy: { incurredAt: "desc" },
      take: 200,
    }),
    prisma.campaign.findMany({
      where: { mergedIntoId: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Chi phí</h1>
        <p className="text-sm text-muted-foreground">
          Chi phí ads/lương/khác gắn (tùy chọn) với campaign hoặc video — dùng cho dashboard doanh
          thu/chi phí/lợi nhuận. Chi phí sản xuất từng video quản lý riêng ở trang video.
        </p>
      </div>

      {error ? (
        <p className="max-w-xl rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Thêm chi phí</h2>
        <ExpenseForm action={createExpense} campaigns={campaigns} submitLabel="Thêm chi phí" />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Danh sách ({expenses.length})</h2>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ngày</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead className="text-right">Số tiền</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Video</TableHead>
                <TableHead>Ghi chú</TableHead>
                <TableHead>Người tạo</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    Chưa có chi phí nào
                  </TableCell>
                </TableRow>
              ) : (
                expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm whitespace-nowrap">{formatDate(e.incurredAt)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{EXPENSE_CATEGORY_LABELS[e.category]}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm whitespace-nowrap">{formatVnd(e.amount)}</TableCell>
                    <TableCell className="text-sm">{e.campaign?.name ?? "—"}</TableCell>
                    <TableCell className="max-w-48 truncate text-sm" title={e.video?.videoUrl ?? undefined}>
                      {e.video?.videoUrl ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-sm" title={e.note ?? undefined}>
                      {e.note ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">{e.createdBy.fullName}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/expenses/${e.id}`} className="text-sm text-primary hover:underline">
                        Sửa
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
