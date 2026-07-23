import { prisma } from "@/lib/prisma";
import { requireSystemAdmin } from "@/lib/authz";
import { syncScalefNow, matchScalefVideo, unmatchScalefVideo } from "@/server/actions/scalef";
import { extractHashtags, normalizeHashtag } from "@/server/scalef/sync";
import { SCRAPE_RUN_STATUS_LABELS, formatDate, formatDateTime, formatVnd } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Màn Tech đối soát đồng bộ ScaleF: log lần chạy + ghép tay scalef_videos chưa khớp được video nội bộ.
export default async function ScalefPage({
  searchParams,
}: {
  searchParams: Promise<{ synced?: string; error?: string }>;
}) {
  await requireSystemAdmin();
  const sp = await searchParams;

  const [runs, unmatched, activeTalents] = await Promise.all([
    prisma.scrapeRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
    prisma.scalefVideo.findMany({
      where: { videoId: null },
      orderBy: { firstSeenAt: "desc" },
      include: { dailyStats: { orderBy: { statDate: "desc" }, take: 1 } },
    }),
    prisma.talent.findMany({
      where: { status: "ACTIVE", scalefHashtag: { not: null } },
      select: { id: true, fullName: true, scalefHashtag: true, manager: { select: { fullName: true } } },
    }),
  ]);

  // Với mỗi hàng chưa khớp, tính lại candidate/xung đột từ title đã lưu — không gọi lại API ScaleF.
  const rows = await Promise.all(
    unmatched.map(async (sv) => {
      const tags = new Set(extractHashtags(sv.title));
      const matchedTalents = activeTalents.filter((t) => {
        const normalized = normalizeHashtag(t.scalefHashtag);
        return normalized && tags.has(normalized);
      });

      let candidates: { id: string; videoUrl: string; airDate: Date }[] = [];
      if (matchedTalents.length === 1) {
        candidates = await prisma.video.findMany({
          where: {
            talentId: matchedTalents[0].id,
            scalefSubmittedAt: { not: null },
            scalefVideos: { none: {} },
          },
          select: { id: true, videoUrl: true, airDate: true },
          orderBy: { airDate: "desc" },
        });
      }

      return { sv, matchedTalents, candidates };
    }),
  );

  const lastRun = runs[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Đồng bộ ScaleF</h1>
          <p className="text-sm text-muted-foreground">
            Video đã duyệt, view hàng ngày, thưởng theo view/post — nguồn thật để đối chiếu với số
            giả định (80.000 view/video) đang dùng ở lương/thưởng MM.
          </p>
        </div>
        <form action={syncScalefNow}>
          <Button type="submit">Đồng bộ ngay</Button>
        </form>
      </div>

      {sp.synced ? (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          Đồng bộ xong — {sp.synced} content.
        </p>
      ) : null}
      {sp.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{sp.error}</p>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Lịch sử đồng bộ</h2>
        {lastRun ? (
          <p className="text-sm text-muted-foreground">
            Lần cuối {formatDateTime(lastRun.startedAt)} —{" "}
            <Badge variant={lastRun.status === "SUCCESS" ? "default" : "destructive"}>
              {SCRAPE_RUN_STATUS_LABELS[lastRun.status]}
            </Badge>{" "}
            — {lastRun.itemsFound} content
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Chưa chạy lần nào.</p>
        )}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bắt đầu</TableHead>
                <TableHead>Kết thúc</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Số content</TableHead>
                <TableHead>Lỗi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    Chưa có lần đồng bộ nào
                  </TableCell>
                </TableRow>
              ) : (
                runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm whitespace-nowrap">{formatDateTime(r.startedAt)}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{formatDateTime(r.finishedAt)}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "SUCCESS" ? "default" : "destructive"}>
                        {SCRAPE_RUN_STATUS_LABELS[r.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{r.itemsFound}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.errorMessage ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Ghép tay ({rows.length})</h2>
        <p className="text-sm text-muted-foreground">
          Video ScaleF chưa gán được video nội bộ — hashtag không nhận diện được, trùng nhiều
          Talent, hoặc nhiều/không video ứng viên để tự chọn.
        </p>
        <div className="rounded-md border">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-72">Content ScaleF</TableHead>
                <TableHead>View/Thưởng gần nhất</TableHead>
                <TableHead className="w-80">Nhận diện</TableHead>
                <TableHead className="w-64" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Không còn dòng nào cần ghép tay
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(({ sv, matchedTalents, candidates }) => {
                  const latestStat = sv.dailyStats[0];
                  return (
                    <TableRow key={sv.id}>
                      <TableCell className="w-72 max-w-72 text-sm">
                        <a
                          href={sv.scalefUrl}
                          target="_blank"
                          rel="noreferrer"
                          title={sv.title || sv.scalefKey}
                          className="block truncate hover:underline"
                        >
                          {sv.title || sv.scalefKey}
                        </a>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {latestStat
                          ? `${latestStat.views.toLocaleString("vi-VN")} view · ${formatVnd(latestStat.rewardAmount)} (${formatDate(latestStat.statDate)})`
                          : "—"}
                      </TableCell>
                      <TableCell className="w-80 max-w-80 text-xs">
                        {matchedTalents.length === 0 ? (
                          <span className="text-muted-foreground">Không nhận diện được hashtag nào</span>
                        ) : matchedTalents.length > 1 ? (
                          <span className="text-amber-700">
                            Hashtag thuộc {matchedTalents.length} người:{" "}
                            {matchedTalents
                              .map((t) => `${t.fullName} (quản lý: ${t.manager.fullName})`)
                              .join(" / ")}{" "}
                            — chọn tay
                          </span>
                        ) : candidates.length === 0 ? (
                          <span className="text-muted-foreground">
                            Khớp Talent {matchedTalents[0].fullName} nhưng chưa có video nào đã nộp
                            ScaleF để chọn
                          </span>
                        ) : (
                          <span>
                            Khớp Talent <strong>{matchedTalents[0].fullName}</strong> —{" "}
                            {candidates.length} video ứng viên
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="w-64 text-right">
                        {candidates.length > 0 ? (
                          <form action={matchScalefVideo.bind(null, sv.id)} className="flex justify-end gap-1">
                            <select
                              name="videoId"
                              required
                              className="h-8 w-40 rounded-md border border-input bg-transparent px-2 text-xs"
                            >
                              {candidates.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {formatDate(c.airDate)} · {c.videoUrl.slice(0, 40)}
                                </option>
                              ))}
                            </select>
                            <Button type="submit" size="sm">
                              Ghép
                            </Button>
                          </form>
                        ) : sv.videoId ? (
                          <form action={unmatchScalefVideo.bind(null, sv.id)}>
                            <Button type="submit" size="sm" variant="ghost">
                              Gỡ ghép
                            </Button>
                          </form>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
