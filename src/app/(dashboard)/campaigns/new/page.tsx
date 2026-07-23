import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { createCampaign } from "@/server/actions/campaigns";
import { CampaignForm } from "@/components/campaign-form";

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireRole("CFO", "TECH", "MM");
  const { error } = await searchParams;

  // MM chỉ được đứng tên campaign của chính mình
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
        <h1 className="text-2xl font-semibold">Tạo campaign</h1>
        <p className="text-sm text-muted-foreground">
          Nhập brief nhận được, sau đó giao Talent ở màn hình chi tiết.
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
        <CampaignForm action={createCampaign} managers={managers} submitLabel="Tạo campaign" />
      )}
    </div>
  );
}
