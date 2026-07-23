import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { payrollItemScopeWhere, requireUser } from "@/lib/authz";
import { isSystemAdmin } from "@/lib/roles";
import { approvePeriod, markPeriodPaid, reopenPeriod } from "@/server/actions/payroll";
import { PAYROLL_PERIOD_STATUS_LABELS, formatVnd } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type CampaignLine = {
  campaignName: string;
  videoCount: number;
  viewsEquivalent: number;
  revenueAfterTax: number;
  productionCost: number;
  savingsBonus: number;
  profit: number;
  profitShare: number;
  campaignTotal: number;
};
type BookingLine = { brandName: string; castAmount: number; role: string; share: number; amount: number };
type ReferralLine = { talentName: string; milestone: number; amount: number };
type Breakdown = {
  campaigns?: CampaignLine[];
  bookingDeals?: BookingLine[];
  referrals?: ReferralLine[];
  videoCount?: number;
  topPerformer?: { rank: number; minVideos: number; amount: number } | null;
  quantityTier?: { minVideos: number; amount: number } | null;
};

// Breakdown là JSONB, hình dạng khác nhau theo nguồn (commission campaign / booking / referral cho
// MM, top/số lượng cho Talent) — render theo từng khối có mặt, không giả định đủ mọi trường.
function BreakdownView({ breakdown }: { breakdown: Breakdown }) {
  return (
    <div className="space-y-3 text-sm">
      {breakdown.campaigns && breakdown.campaigns.length > 0 ? (
        <div>
          <p className="mb-1 font-medium">Commission theo campaign</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead className="text-right">Video</TableHead>
                <TableHead className="text-right">Views quy đổi</TableHead>
                <TableHead className="text-right">Doanh thu sau thuế</TableHead>
                <TableHead className="text-right">Chi phí sản xuất</TableHead>
                <TableHead className="text-right">Thưởng tiết kiệm</TableHead>
                <TableHead className="text-right">Lợi nhuận</TableHead>
                <TableHead className="text-right">Com MM</TableHead>
                <TableHead className="text-right">Tổng</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown.campaigns.map((c, i) => (
                <TableRow key={i}>
                  <TableCell>{c.campaignName}</TableCell>
                  <TableCell className="text-right">{c.videoCount}</TableCell>
                  <TableCell className="text-right">{c.viewsEquivalent.toLocaleString("vi-VN")}</TableCell>
                  <TableCell className="text-right">{formatVnd(c.revenueAfterTax)}</TableCell>
                  <TableCell className="text-right">{formatVnd(c.productionCost)}</TableCell>
                  <TableCell className="text-right">{formatVnd(c.savingsBonus)}</TableCell>
                  <TableCell className="text-right">{formatVnd(c.profit)}</TableCell>
                  <TableCell className="text-right">{formatVnd(c.profitShare)}</TableCell>
                  <TableCell className="text-right font-medium">{formatVnd(c.campaignTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {breakdown.bookingDeals && breakdown.bookingDeals.length > 0 ? (
        <div>
          <p className="mb-1 font-medium">Booking</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deal</TableHead>
                <TableHead>Vai trò</TableHead>
                <TableHead className="text-right">Giá trị deal</TableHead>
                <TableHead className="text-right">% chia</TableHead>
                <TableHead className="text-right">Nhận</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown.bookingDeals.map((b, i) => (
                <TableRow key={i}>
                  <TableCell>{b.brandName}</TableCell>
                  <TableCell>{b.role === "mm" ? "MM quản lý" : "Người bán deal"}</TableCell>
                  <TableCell className="text-right">{formatVnd(b.castAmount)}</TableCell>
                  <TableCell className="text-right">{Math.round(b.share * 100)}%</TableCell>
                  <TableCell className="text-right font-medium">{formatVnd(b.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {breakdown.referrals && breakdown.referrals.length > 0 ? (
        <div>
          <p className="mb-1 font-medium">Thưởng tuyển dụng (giới thiệu Talent)</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Talent</TableHead>
                <TableHead>Mốc</TableHead>
                <TableHead className="text-right">Thưởng</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown.referrals.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.talentName}</TableCell>
                  <TableCell>Mốc {r.milestone}</TableCell>
                  <TableCell className="text-right font-medium">{formatVnd(r.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {breakdown.videoCount != null ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Video campaign trong tháng: {breakdown.videoCount}</span>
          {breakdown.topPerformer ? (
            <Badge>
              Top {breakdown.topPerformer.rank} công ty (&gt;{breakdown.topPerformer.minVideos} video) — {formatVnd(breakdown.topPerformer.amount)}
            </Badge>
          ) : null}
          {breakdown.quantityTier ? (
            <Badge variant="secondary">
              Mốc {breakdown.quantityTier.minVideos} video — {formatVnd(breakdown.quantityTier.amount)}
            </Badge>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default async function PayrollPeriodDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; warnings?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { error, saved, warnings } = await searchParams;

  const period = await prisma.payrollPeriod.findUnique({
    where: { id },
    include: {
      approvedBy: true,
      items: {
        where: payrollItemScopeWhere(user),
        include: { user: true, talent: true },
        orderBy: [{ userId: "asc" }, { talentId: "asc" }],
      },
    },
  });
  if (!period) notFound();
  // MM chỉ vào được kỳ có phần của mình (payrollItemScopeWhere lọc items rỗng nếu không có phần).
  if (user.role === "MM" && period.items.length === 0) notFound();

  const mmItems = period.items.filter((i) => i.userId);
  const talentItems = period.items.filter((i) => i.talentId);
  const grandTotal = period.items.reduce((s, i) => s + i.total, 0);
  const parsedWarnings: string[] = warnings ? JSON.parse(warnings) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Kỳ lương {period.month}</h1>
        <Badge variant={period.status === "PAID" ? "default" : "secondary"}>
          {PAYROLL_PERIOD_STATUS_LABELS[period.status]}
        </Badge>
      </div>

      {error ? (
        <p className="max-w-xl rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}
      {saved ? (
        <p className="max-w-xl rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">Đã lưu thay đổi</p>
      ) : null}
      {parsedWarnings.length > 0 ? (
        <div className="max-w-2xl rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
          <p className="font-medium">{parsedWarnings.length} cảnh báo khi tính nháp:</p>
          <ul className="list-disc pl-5">
            {parsedWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {isSystemAdmin(user.role) ? (
        <div className="flex items-center gap-3">
          {period.status === "DRAFT" ? (
            <form action={approvePeriod.bind(null, period.id)}>
              <Button type="submit">Duyệt kỳ lương</Button>
            </form>
          ) : null}
          {period.status === "APPROVED" ? (
            <form action={markPeriodPaid.bind(null, period.id)}>
              <Button type="submit">Đánh dấu đã trả</Button>
            </form>
          ) : null}
          {period.status === "APPROVED" || period.status === "PAID" ? (
            <form action={reopenPeriod.bind(null, period.id)}>
              <Button type="submit" variant="outline">
                Mở lại kỳ lương
              </Button>
            </form>
          ) : null}
          {period.approvedBy ? (
            <span className="text-sm text-muted-foreground">
              Duyệt bởi {period.approvedBy.fullName} lúc {period.approvedAt?.toLocaleString("vi-VN")}
            </span>
          ) : null}
        </div>
      ) : null}

      {isSystemAdmin(user.role) ? (
        <p className="text-sm text-muted-foreground">
          Tổng toàn kỳ: <span className="font-medium text-foreground">{formatVnd(grandTotal)}</span> ({period.items.length} dòng)
        </p>
      ) : null}

      {mmItems.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-medium">MM</h2>
          {mmItems.map((item) => (
            <div key={item.id} className="rounded-md border p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-medium">{item.user?.fullName}</p>
                <p className="text-lg font-semibold">{formatVnd(item.total)}</p>
              </div>
              <BreakdownView breakdown={item.breakdown as Breakdown} />
            </div>
          ))}
        </section>
      ) : null}

      {talentItems.length > 0 ? (
        <>
          <Separator />
          <section className="space-y-4">
            <h2 className="text-lg font-medium">Talent (thưởng Top / số lượng)</h2>
            {talentItems.map((item) => (
              <div key={item.id} className="rounded-md border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-medium">{item.talent?.fullName}</p>
                  <p className="text-lg font-semibold">{formatVnd(item.total)}</p>
                </div>
                <BreakdownView breakdown={item.breakdown as Breakdown} />
              </div>
            ))}
          </section>
        </>
      ) : null}

      {period.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Chưa có dòng nào trong kỳ này — thiếu cơ chế Campaign, hoặc chưa có video/booking trong tháng.
        </p>
      ) : null}
    </div>
  );
}
