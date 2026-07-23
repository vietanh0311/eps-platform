import { prisma } from "@/lib/prisma";
import { insightRoleWhere, type SessionUser } from "@/lib/authz";
import { runInsightsNow } from "@/server/actions/insights";
import { INSIGHT_TYPE_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isSystemAdmin } from "@/lib/roles";

const SEVERITY_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  INFO: "secondary",
  WARNING: "default",
  CRITICAL: "destructive",
};

// Danh sách insight đang mở, lọc theo role (visibleToRoles). MM chỉ thấy insight liên quan tới
// team mình (data.managerId === user.id) — lọc ở đây thay vì mỗi trang tự lọc lại.
export async function InsightsPanel({ user }: { user: SessionUser }) {
  const rows = await prisma.insight.findMany({
    where: { ...insightRoleWhere(user), resolvedAt: null },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    take: 30,
  });

  const visible =
    user.role === "MM" ? rows.filter((r) => (r.data as Record<string, unknown>)?.managerId === user.id) : rows;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Cảnh báo ({visible.length})</h2>
        {isSystemAdmin(user.role) ? (
          <form action={runInsightsNow}>
            <Button type="submit" size="sm" variant="outline">
              Chạy insight ngay
            </Button>
          </form>
        ) : null}
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Không có cảnh báo nào đang mở.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((r) => (
            <div key={r.id} className="flex items-start gap-3 rounded-md border px-3 py-2">
              <Badge variant={SEVERITY_VARIANT[r.severity] ?? "secondary"}>{INSIGHT_TYPE_LABELS[r.type] ?? r.type}</Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{r.title}</p>
                <p className="text-xs text-muted-foreground">{r.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
