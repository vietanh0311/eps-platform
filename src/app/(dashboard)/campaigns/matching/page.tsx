import { requireSystemAdmin } from "@/lib/authz";
import { findMatchCandidates } from "@/server/campaigns/matching";
import { dismissCampaignMatch, mergeCampaign } from "@/server/actions/campaigns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

// Vấn đề 3 (2026-07-24) — màn duyệt tay cặp campaign MANUAL (điền tay cũ) ↔ AMBASSADOR
// (auto-sync) nghi ngờ trùng brand. Chỉ gợi ý, không tự khớp/gộp — xem
// src/server/campaigns/matching.ts và docs/DB_SCHEMA.md nhóm 3 để biết lý do (khớp mờ theo tên
// brand đã chứng minh có thể sai, 1 brand có thể có nhiều đợt Ambassador chạy song song).
export default async function CampaignMatchingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireSystemAdmin();
  const { error } = await searchParams;
  const candidates = await findMatchCandidates();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Duyệt campaign nghi ngờ trùng</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Campaign điền tay cũ (nhóm thô theo tên brand) và campaign đồng bộ tự động từ Ambassador
          có tên nhãn hàng trùng nhau — KHÔNG chắc chắn là cùng 1 đợt thật (1 brand có thể chạy
          nhiều đợt Ambassador song song). Tự xem và quyết định: "Bỏ qua" nếu không phải cùng đợt,
          hoặc "Gộp" nếu chắc chắn — hệ thống không tự động khớp/gộp.
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">Không còn cặp nào cần duyệt.</p>
      ) : (
        <div className="space-y-4">
          {candidates.map(({ manual, ambassador }) => (
            <div key={`${manual.id}:${ambassador.id}`} className="max-w-4xl space-y-3 rounded-md border p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Badge variant="outline">Điền tay (MANUAL)</Badge>
                  <p className="mt-1 font-medium">{manual.name}</p>
                  <p className="text-sm text-muted-foreground">{manual.brandName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    MM: {manual.managerNames.length > 0 ? manual.managerNames.join(", ") : "chưa nhận"} ·{" "}
                    {manual.videoCount} video · {manual.assignmentCount} Talent giao
                  </p>
                  {manual.lockedMonths.length > 0 ? (
                    <p className="mt-1 text-xs text-amber-700">
                      ⚠ Có video thuộc kỳ lương đã duyệt/trả: {manual.lockedMonths.join(", ")} — gộp
                      xong cần bấm &quot;Tính nháp lại&quot; ở kỳ đó nếu muốn số liệu phản ánh đúng.
                    </p>
                  ) : null}
                </div>
                <div>
                  <Badge variant="outline">Ambassador (auto-sync)</Badge>
                  <p className="mt-1 font-medium">{ambassador.name}</p>
                  <p className="text-sm text-muted-foreground">{ambassador.brandName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    MM: {ambassador.managerNames.length > 0 ? ambassador.managerNames.join(", ") : "chưa nhận"} ·{" "}
                    {ambassador.hasRewardTerms ? "đã có cơ chế giá" : "chưa có cơ chế giá"}
                  </p>
                </div>
              </div>
              <Separator />
              <div className="flex flex-wrap items-center gap-3">
                <form action={dismissCampaignMatch.bind(null, manual.id, ambassador.id)}>
                  <Button type="submit" variant="ghost" size="sm">
                    Bỏ qua — không phải cùng đợt
                  </Button>
                </form>
                <form action={mergeCampaign.bind(null, manual.id, ambassador.id)}>
                  <Button type="submit" size="sm">
                    Gộp vào Ambassador
                  </Button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
