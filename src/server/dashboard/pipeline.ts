// Số liệu vận hành cho AdminDashboard (Module 6) — phễu pipeline Tech, tình trạng đồng bộ ScaleF.
// Dùng chung cho Team Finance VÀ Team Tech (system admin ngang quyền).
import { prisma } from "@/lib/prisma";
import { PIPELINE_ORDER } from "@/lib/labels";
import type { PipelineStatus } from "@/generated/prisma/enums";
import type { ScrapeRun } from "@/generated/prisma/client";

export type PipelineOverview = {
  funnel: Array<{ status: PipelineStatus; count: number }>;
  unmatchedScalefCount: number;
  lastScrapeRun: ScrapeRun | null;
};

export async function getPipelineOverview(): Promise<PipelineOverview> {
  const [statusGroups, unmatchedScalefCount, lastScrapeRun] = await Promise.all([
    prisma.video.groupBy({ by: ["pipelineStatus"], _count: { _all: true } }),
    prisma.scalefVideo.count({ where: { videoId: null } }),
    prisma.scrapeRun.findFirst({ orderBy: { startedAt: "desc" } }),
  ]);

  const countByStatus = new Map(statusGroups.map((g) => [g.pipelineStatus, g._count._all]));
  const funnel = PIPELINE_ORDER.map((status) => ({ status, count: countByStatus.get(status) ?? 0 }));

  return { funnel, unmatchedScalefCount, lastScrapeRun };
}
