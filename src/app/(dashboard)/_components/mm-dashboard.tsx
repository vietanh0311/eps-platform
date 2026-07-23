import Link from "next/link";
import { getMmTeamOverview } from "@/server/dashboard/team";
import { InsightsPanel } from "./insights-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SessionUser } from "@/lib/authz";

export async function MmDashboard({ user }: { user: SessionUser }) {
  const team = await getMmTeamOverview(user);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Talent quản lý</CardDescription>
            <CardTitle className="text-3xl">{team.talentCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">{team.activeTalentCount} đang hoạt động</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Video air tháng này</CardDescription>
            <CardTitle className="text-3xl">{team.videosThisMonth}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Tính theo ngày air</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Video chậm tiến độ</CardDescription>
            <CardTitle className={"text-3xl " + (team.lateVideos.length > 0 ? "text-destructive" : "")}>
              {team.lateVideos.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Quá 48h chưa qua bước pipeline tiếp theo</CardContent>
        </Card>
      </div>

      {team.lateVideos.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Video chậm tiến độ của team bạn</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {team.lateVideos.map((v) => (
              <div key={v.id} className="flex items-center justify-between text-sm">
                <span>
                  {v.talentName} — đang &quot;{v.pipelineStatus}&quot;
                </span>
                <span className="text-muted-foreground">{v.hoursStuck}h</span>
              </div>
            ))}
            <Link href="/videos" className="inline-block text-sm text-primary hover:underline">
              Vào /videos →
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <InsightsPanel user={user} />
    </div>
  );
}
