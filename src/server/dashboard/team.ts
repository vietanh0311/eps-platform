// Số liệu MmDashboard (Module 6) — hiệu suất team của MM đang đăng nhập, video chậm tiến độ.
import { prisma } from "@/lib/prisma";
import { talentScopeWhere, videoScopeWhere, insightRoleWhere, type SessionUser } from "@/lib/authz";
import type { Prisma } from "@/generated/prisma/client";

export type LateVideoInsight = {
  id: string;
  videoId: string;
  talentName: string;
  pipelineStatus: string;
  hoursStuck: number;
};

export type MmTeamOverview = {
  talentCount: number;
  activeTalentCount: number;
  videosThisMonth: number;
  lateVideos: LateVideoInsight[];
};

export async function getMmTeamOverview(user: SessionUser): Promise<MmTeamOverview> {
  const talentScope = talentScopeWhere(user);
  const videoScope = videoScopeWhere(user) as Prisma.VideoWhereInput;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // Đọc thẳng insight VIDEO_LATE đã tính sẵn (src/server/insights/engine.ts) thay vì tính lại
  // ngưỡng 48h ở đây — tránh 2 nơi cùng định nghĩa "chậm tiến độ" rồi lệch nhau.
  const [talentCount, activeTalentCount, videosThisMonth, openLateInsights] = await Promise.all([
    prisma.talent.count({ where: talentScope }),
    prisma.talent.count({ where: { ...talentScope, status: "ACTIVE" } }),
    prisma.video.count({ where: { ...videoScope, airDate: { gte: monthStart, lt: nextMonthStart } } }),
    prisma.insight.findMany({ where: { ...insightRoleWhere(user), type: "VIDEO_LATE", resolvedAt: null } }),
  ]);

  const lateVideos: LateVideoInsight[] = openLateInsights
    .filter((i) => (i.data as Record<string, unknown>)?.managerId === user.id)
    .map((i) => {
      const d = i.data as Record<string, unknown>;
      return {
        id: i.id,
        videoId: String(d.videoId ?? ""),
        talentName: String(d.talentName ?? "—"),
        pipelineStatus: String(d.pipelineStatus ?? ""),
        hoursStuck: Number(d.hoursStuck ?? 0),
      };
    });

  return { talentCount, activeTalentCount, videosThisMonth, lateVideos };
}
