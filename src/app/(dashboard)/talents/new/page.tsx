import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { createTalent } from "@/server/actions/talents";
import { TalentForm } from "@/components/talent-form";

export default async function NewTalentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireRole("CFO", "TECH", "MM");
  const { error } = await searchParams;

  // MM chỉ được gán Talent cho chính mình
  const managers =
    user.role === "MM"
      ? [{ id: user.id, fullName: user.name }]
      : await prisma.user.findMany({
          where: { role: "MM", status: "ACTIVE" },
          select: { id: true, fullName: true },
          orderBy: { fullName: "asc" },
        });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Thêm Talent</h1>
        <p className="text-sm text-muted-foreground">
          Tạo hồ sơ trước, thêm kênh social ở bước tiếp theo.
        </p>
      </div>
      {error ? (
        <p className="max-w-xl rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {managers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Chưa có tài khoản MM nào — tạo tài khoản MM trong mục Tài khoản trước.
        </p>
      ) : (
        <TalentForm action={createTalent} managers={managers} submitLabel="Tạo Talent" />
      )}
    </div>
  );
}
