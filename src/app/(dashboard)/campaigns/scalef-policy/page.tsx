import { prisma } from "@/lib/prisma";
import { requireSystemAdmin } from "@/lib/authz";
import { findScalefPolicyCandidates } from "@/server/campaigns/scalef-policy";
import { dismissScalefPolicyMatch, linkScalefEvent, unlinkScalefEvent } from "@/server/actions/campaigns";
import { formatDate } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const REWARD_KIND_LABELS: Record<string, string> = {
  per_view: "Theo view",
  per_post: "Theo post",
  ambiguous: "Không rõ đơn vị",
  unparseable: "Không đọc được",
  empty: "Chưa có",
};

// Vấn đề 1 (2026-07-24) — màn duyệt tay liên kết Campaign EPS ↔ ScaleF Event thật, đọc chính sách
// thưởng (field `reward` tự do trong scalef_events.raw, đã cào sẵn từ Module 4) để gợi ý
// `pricePerView` cho MM. Chỉ gợi ý theo brand — không tự động liên kết/áp dụng, xem
// src/server/campaigns/scalef-policy.ts và docs/DB_SCHEMA.md.
export default async function ScalefPolicyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireSystemAdmin();
  const { error } = await searchParams;

  const [candidates, linkedCampaigns] = await Promise.all([
    findScalefPolicyCandidates(),
    prisma.campaign.findMany({
      where: { scalefEventId: { not: null } },
      include: { scalefEvent: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Chính sách thưởng ScaleF ↔ Campaign</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          ScaleF Event (đã cào sẵn từ trước, chưa dùng tới) có chính sách thưởng riêng — gợi ý
          khớp theo tên nhãn hàng, KHÔNG chắc chắn là cùng 1 campaign thật (1 brand có thể có nhiều
          event/campaign khác nhau). Tự xem và quyết định: "Bỏ qua" nếu không phải, hoặc "Liên kết"
          nếu chắc chắn — hệ thống không tự động khớp/áp dụng giá.
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">Không còn cặp nào cần duyệt.</p>
      ) : (
        <div className="space-y-4">
          {candidates.map(({ campaign, event }) => {
            const canApplyPrice = event.reward.kind === "per_view" && campaign.pricePerView == null;
            return (
              <div
                key={`${campaign.id}:${event.id}`}
                className="max-w-4xl space-y-3 rounded-md border p-4"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Badge variant="outline">Campaign EPS</Badge>
                    <p className="mt-1 font-medium">{campaign.name}</p>
                    <p className="text-sm text-muted-foreground">{campaign.brandName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {campaign.pricePerView != null
                        ? `Đã có giá: ${campaign.pricePerView}đ/view`
                        : "Chưa có cơ chế giá"}
                    </p>
                  </div>
                  <div>
                    <Badge variant="outline">ScaleF Event</Badge>
                    <p className="mt-1 font-medium">{event.name}</p>
                    <p className="text-sm text-muted-foreground">{event.partnerName ?? "—"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(event.startAt)} → {formatDate(event.endAt)}
                    </p>
                    <p className="mt-1 text-xs">
                      Reward: <span className="font-mono">{event.reward.raw || "—"}</span>{" "}
                      <Badge variant="secondary">{REWARD_KIND_LABELS[event.reward.kind]}</Badge>
                    </p>
                    {event.reward.kind === "per_post" ? (
                      <p className="mt-1 text-xs text-amber-700">
                        Trả theo post — công thức MM hiện chỉ tính theo view, không tự quy đổi. Tự
                        điền tay nếu muốn dùng.
                      </p>
                    ) : null}
                    {campaign.pricePerView != null && event.reward.kind === "per_view" ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Campaign đã có giá riêng — không tự ghi đè.
                      </p>
                    ) : null}
                  </div>
                </div>
                <Separator />
                <div className="flex flex-wrap items-center gap-3">
                  <form action={dismissScalefPolicyMatch.bind(null, campaign.id, event.id)}>
                    <Button type="submit" variant="ghost" size="sm">
                      Bỏ qua — không phải cùng campaign
                    </Button>
                  </form>
                  <form
                    action={linkScalefEvent.bind(null, campaign.id, event.id)}
                    className="flex items-center gap-2"
                  >
                    {canApplyPrice ? (
                      <Input
                        type="number"
                        name="applyPrice"
                        min={0}
                        defaultValue={event.reward.value ?? ""}
                        className="w-28"
                      />
                    ) : null}
                    <Button type="submit" size="sm">
                      {canApplyPrice ? "Liên kết & áp dụng giá này" : "Liên kết"}
                    </Button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Campaign đã liên kết ScaleF Event</h2>
        <div className="max-w-3xl rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>ScaleF Event</TableHead>
                <TableHead className="text-right">Gỡ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linkedCampaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-4 text-center text-muted-foreground">
                    Chưa liên kết campaign nào
                  </TableCell>
                </TableRow>
              ) : (
                linkedCampaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.scalefEvent?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <form action={unlinkScalefEvent.bind(null, c.id)}>
                        <Button type="submit" variant="ghost" size="sm">
                          Gỡ liên kết
                        </Button>
                      </form>
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
