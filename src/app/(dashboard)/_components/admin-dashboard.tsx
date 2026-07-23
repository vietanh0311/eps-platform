import Link from "next/link";
import { getFinanceOverview } from "@/server/dashboard/finance";
import { getPipelineOverview } from "@/server/dashboard/pipeline";
import { DataQualityBanners } from "./data-quality-banners";
import { InsightsPanel } from "./insights-panel";
import { RevenueCostChart, ProfitTrendChart } from "./finance-charts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PIPELINE_STATUS_LABELS, SCRAPE_RUN_STATUS_LABELS, formatDateTime, formatVnd } from "@/lib/labels";
import type { SessionUser } from "@/lib/authz";

// Dashboard dùng chung cho Team Finance VÀ Team Tech (system admin ngang quyền — xem
// docs/PROJECT_EPS.md/kế hoạch Module 6): gộp phần tài chính (trước đây chỉ CFO thấy) + phần vận
// hành pipeline/ScaleF (trước đây chỉ Tech thấy) vào 1 view, khớp quyền ngang nhau đã merge ở PR
// "module-6-team-tech-finance-parity".
export async function AdminDashboard({ user }: { user: SessionUser }) {
  const [finance, pipeline] = await Promise.all([getFinanceOverview(), getPipelineOverview()]);

  return (
    <div className="space-y-6">
      <DataQualityBanners matchStatus={finance.matchStatus} costStatus={finance.costStatus} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Doanh thu (6 tháng)</CardDescription>
            <CardTitle className="text-2xl">{formatVnd(finance.totals.revenue)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Contract value + ScaleF thật (đã ghép)</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Chi phí (6 tháng)</CardDescription>
            <CardTitle className="text-2xl">{formatVnd(finance.totals.cost)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Sản xuất + expenses + lương</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Lợi nhuận (6 tháng)</CardDescription>
            <CardTitle className={"text-2xl " + (finance.totals.profit < 0 ? "text-destructive" : "")}>
              {formatVnd(finance.totals.profit)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Xem banner cảnh báo độ tin cậy ở trên</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Doanh thu vs chi phí theo tháng</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueCostChart series={finance.series} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lợi nhuận theo tháng</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfitTrendChart series={finance.series} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Talent (6 tháng, theo số video)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {finance.topTalents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có dữ liệu</p>
            ) : (
              finance.topTalents.map((t, i) => (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <span>
                    {i + 1}. {t.name}
                  </span>
                  <span className="text-muted-foreground">{t.videoCount} video</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Campaign (6 tháng, theo số video)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {finance.topCampaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có dữ liệu</p>
            ) : (
              finance.topCampaigns.map((c, i) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span>
                    {i + 1}. {c.name}
                  </span>
                  <span className="text-muted-foreground">{c.videoCount} video</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pipeline Tech</CardTitle>
          <CardDescription>Số video theo trạng thái pipeline hiện tại (toàn hệ thống)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {pipeline.funnel.map((f) => (
              <div key={f.status} className="rounded-md border px-3 py-2">
                <p className="text-xs text-muted-foreground">{PIPELINE_STATUS_LABELS[f.status]}</p>
                <p className="text-xl font-semibold">{f.count}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span>
              Đồng bộ ScaleF lần cuối:{" "}
              {pipeline.lastScrapeRun ? (
                <>
                  {formatDateTime(pipeline.lastScrapeRun.startedAt)} —{" "}
                  <Badge variant={pipeline.lastScrapeRun.status === "SUCCESS" ? "default" : "destructive"}>
                    {SCRAPE_RUN_STATUS_LABELS[pipeline.lastScrapeRun.status]}
                  </Badge>
                </>
              ) : (
                "chưa chạy lần nào"
              )}
            </span>
            <span className="text-muted-foreground">
              {pipeline.unmatchedScalefCount} video ScaleF chưa ghép Talent
            </span>
            <Link href="/scalef" className="text-primary hover:underline">
              Vào /scalef →
            </Link>
          </div>
        </CardContent>
      </Card>

      <InsightsPanel user={user} />
    </div>
  );
}
