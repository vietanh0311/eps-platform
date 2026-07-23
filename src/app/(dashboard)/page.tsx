import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { campaignScopeWhere, requireUser, talentScopeWhere, videoScopeWhere } from "@/lib/authz";
import { isSystemAdmin } from "@/lib/roles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminDashboard } from "./_components/admin-dashboard";
import { MmDashboard } from "./_components/mm-dashboard";
import type { Prisma } from "@/generated/prisma/client";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ insightsCreated?: string; insightsResolved?: string; insightsError?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const talentScope = talentScopeWhere(user);
  const videoScope = videoScopeWhere(user) as Prisma.VideoWhereInput;

  // Video air trong tháng hiện tại — cần cả 2 đầu mốc, không chỉ gte: 1 vài video import có
  // ngày air lệch sang tháng sau (dữ liệu gốc trong sheet, đã cảnh báo lúc import) mới tính là
  // "tháng này" mãi mãi.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [totalTalents, activeTalents, runningCampaigns, videosThisMonth, notSubmitted, awaitingConfirm] =
    await Promise.all([
      prisma.talent.count({ where: talentScope }),
      prisma.talent.count({ where: { ...talentScope, status: "ACTIVE" } }),
      prisma.campaign.count({ where: { ...campaignScopeWhere(user), status: "RUNNING" } }),
      prisma.video.count({ where: { ...videoScope, airDate: { gte: monthStart, lt: nextMonthStart } } }),
      prisma.video.count({ where: { ...videoScope, scalefSubmittedAt: null } }),
      prisma.video.count({
        where: { ...videoScope, scalefSubmittedAt: { not: null }, scalefConfirmedAt: null },
      }),
    ]);

  const stats = [
    {
      label: "Talent",
      value: totalTalents,
      hint: user.role === "MM" ? "do bạn quản lý" : "toàn hệ thống",
      href: "/talents",
    },
    { label: "Talent đang hoạt động", value: activeTalents, hint: "trạng thái ACTIVE", href: "/talents?status=ACTIVE" },
    { label: "Campaign đang chạy", value: runningCampaigns, hint: "trạng thái Đang chạy", href: "/campaigns?status=RUNNING" },
    { label: "Video air tháng này", value: videosThisMonth, hint: "tính theo ngày air", href: "/videos" },
    {
      label: "Tech chưa nộp ScaleF",
      value: notSubmitted,
      hint: "hàng đợi của team Tech",
      href: "/videos?scalef=unsubmitted",
    },
    {
      label: user.role === "MM" ? "Chờ bạn xác nhận" : "Chờ MM xác nhận",
      value: awaitingConfirm,
      hint: "Tech đã nộp, chờ MM check",
      href: "/videos?scalef=awaiting",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tổng quan</h1>
        <p className="text-sm text-muted-foreground">
          Doanh thu, chi phí, lợi nhuận, cảnh báo tự động — cập nhật theo dữ liệu thật trong hệ thống.
        </p>
      </div>

      {sp.insightsCreated || sp.insightsResolved ? (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          Chạy insight xong — tạo mới {sp.insightsCreated ?? 0}, đóng {sp.insightsResolved ?? 0}.
        </p>
      ) : null}
      {sp.insightsError ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{sp.insightsError}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="h-full transition-colors hover:border-primary">
              <CardHeader className="pb-2">
                <CardDescription>{s.label}</CardDescription>
                <CardTitle className="text-3xl">{s.value}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">{s.hint}</CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {isSystemAdmin(user.role) ? <AdminDashboard user={user} /> : user.role === "MM" ? <MmDashboard user={user} /> : null}
    </div>
  );
}
