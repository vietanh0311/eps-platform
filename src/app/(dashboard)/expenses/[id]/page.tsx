import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSystemAdmin } from "@/lib/authz";
import { updateExpense, deleteExpense } from "@/server/actions/expenses";
import { ExpenseForm } from "@/components/expense-form";
import { Button } from "@/components/ui/button";

export default async function EditExpensePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireSystemAdmin();
  const { id } = await params;
  const { error } = await searchParams;

  const [expense, campaigns] = await Promise.all([
    prisma.expense.findUnique({ where: { id }, include: { video: { select: { videoUrl: true } } } }),
    prisma.campaign.findMany({
      where: { mergedIntoId: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!expense) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sửa chi phí</h1>
      </div>
      {error ? (
        <p className="max-w-xl rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      <ExpenseForm
        action={updateExpense.bind(null, expense.id)}
        expense={expense}
        campaigns={campaigns}
        defaultVideoUrl={expense.video?.videoUrl}
        submitLabel="Lưu thay đổi"
      />

      <form action={deleteExpense.bind(null, expense.id)}>
        <Button type="submit" variant="destructive" size="sm">
          Xóa chi phí này
        </Button>
      </form>
    </div>
  );
}
