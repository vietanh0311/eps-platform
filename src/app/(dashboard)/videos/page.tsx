import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  canConfirmScalef,
  canEditPipeline,
  canReviewVideo,
  requireUser,
  videoScopeWhere,
  type SessionUser,
} from "@/lib/authz";
import { isSystemAdmin } from "@/lib/roles";
import {
  bulkSetProductionCost,
  confirmScalefSubmission,
  deleteVideo,
  submitToScalef,
  undoConfirmScalef,
  undoSubmitToScalef,
} from "@/server/actions/videos";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import {
  PIPELINE_STATUS_LABELS,
  PLATFORM_LABELS,
  REVIEW_STATUS_LABELS,
  formatDate,
  formatDateTime,
  formatVnd,
} from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PipelineStatus, Prisma, ReviewStatus } from "@/generated/prisma/client";

const PAGE_SIZE = 100;

// Bộ lọc theo 2 mốc ScaleF: Tech nộp -> MM xác nhận.
const SCALEF_FILTERS: Record<string, Prisma.VideoWhereInput> = {
  unsubmitted: { scalefSubmittedAt: null },
  awaiting: { scalefSubmittedAt: { not: null }, scalefConfirmedAt: null },
  confirmed: { scalefConfirmedAt: { not: null } },
};

type SearchParams = {
  q?: string;
  from?: string;
  to?: string;
  talent?: string;
  campaign?: string;
  review?: string;
  pipeline?: string;
  mm?: string;
  scalef?: string;
  cost?: string;
  page?: string;
  created?: string;
  skipped?: string;
  error?: string;
  bulkUpdated?: string;
  bulkSkipped?: string;
};

export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const scope = videoScopeWhere(user) as Prisma.VideoWhereInput;
  const where: Prisma.VideoWhereInput = { ...scope };

  if (sp.talent) where.talentId = sp.talent;
  if (sp.campaign) where.campaignId = sp.campaign;
  if (sp.review && sp.review in REVIEW_STATUS_LABELS) where.reviewStatus = sp.review as ReviewStatus;
  if (sp.pipeline && sp.pipeline in PIPELINE_STATUS_LABELS)
    where.pipelineStatus = sp.pipeline as PipelineStatus;
  if (sp.mm && user.role !== "MM") where.talent = { managerId: sp.mm };
  if (sp.q) where.videoUrl = { contains: sp.q, mode: "insensitive" };
  if (sp.from || sp.to) {
    where.airDate = {
      ...(sp.from ? { gte: new Date(sp.from) } : {}),
      ...(sp.to ? { lte: new Date(sp.to) } : {}),
    };
  }
  if (sp.scalef && sp.scalef in SCALEF_FILTERS) Object.assign(where, SCALEF_FILTERS[sp.scalef]);
  if (sp.cost === "missing") where.productionCost = null;

  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const [videos, total, talents, campaigns, managers, unsubmittedCount, awaitingCount, costMissingCount] =
    await Promise.all([
      prisma.video.findMany({
        where,
        include: {
          talent: { select: { id: true, fullName: true, managerId: true } },
          campaign: { select: { id: true, name: true } },
          scalefSubmittedBy: { select: { fullName: true } },
          scalefConfirmedBy: { select: { fullName: true } },
        },
        orderBy: [{ airDate: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.video.count({ where }),
      prisma.talent.findMany({
        where: user.role === "MM" ? { managerId: user.id } : {},
        select: { id: true, fullName: true },
        orderBy: { fullName: "asc" },
      }),
      prisma.campaign.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      user.role === "MM"
        ? Promise.resolve([])
        : prisma.user.findMany({ where: { role: "MM" }, orderBy: { fullName: "asc" } }),
      prisma.video.count({ where: { ...scope, ...SCALEF_FILTERS.unsubmitted } }),
      prisma.video.count({ where: { ...scope, ...SCALEF_FILTERS.awaiting } }),
      prisma.video.count({ where: { ...scope, productionCost: null } }),
    ]);

  const canLog = isSystemAdmin(user.role) || user.role === "MM";
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Giữ nguyên bộ lọc hiện tại khi bấm sang trang khác.
  const pageLink = (target: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (v && !["page", "created", "skipped", "error"].includes(k)) qs.set(k, String(v));
    }
    qs.set("page", String(target));
    return `/videos?${qs.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Log video</h1>
          <p className="text-sm text-muted-foreground">
            {user.role === "MM" ? "Video của Talent bạn quản lý" : "Toàn bộ video trong hệ thống"}
          </p>
        </div>
        {canLog ? (
          <Button asChild>
            <Link href="/videos/new">+ Log video</Link>
          </Button>
        ) : null}
      </div>

      {sp.created ? (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          Đã tạo {sp.created} video
          {Number(sp.skipped) > 0 ? `, bỏ qua ${sp.skipped} link đã có trong hệ thống` : ""}.
        </p>
      ) : null}
      {sp.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{sp.error}</p>
      ) : null}
      {sp.bulkUpdated ? (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          Đã điền chi phí cho {sp.bulkUpdated} video
          {Number(sp.bulkSkipped) > 0 ? `, bỏ qua ${sp.bulkSkipped} video đã khóa/không có quyền` : ""}.
        </p>
      ) : null}

      {/* Hàng đợi việc: Tech nộp ScaleF trước, MM xác nhận sau, chi phí sản xuất bắt buộc */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/videos?scalef=unsubmitted"
          className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
        >
          Tech chưa nộp ScaleF: <strong>{unsubmittedCount}</strong>
        </Link>
        <Link
          href="/videos?scalef=awaiting"
          className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
        >
          {user.role === "MM" ? "Chờ bạn xác nhận" : "Chờ MM xác nhận"}:{" "}
          <strong>{awaitingCount}</strong>
        </Link>
        <Link
          href="/videos?cost=missing"
          className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
        >
          Chưa có chi phí: <strong>{costMissingCount}</strong>
        </Link>
        <Link href="/videos" className="rounded-md border px-3 py-2 text-sm hover:bg-accent">
          Xem tất cả
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="GET">
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="from">
            Từ ngày
          </label>
          <Input id="from" name="from" type="date" defaultValue={sp.from ?? ""} className="w-40" />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="to">
            Đến ngày
          </label>
          <Input id="to" name="to" type="date" defaultValue={sp.to ?? ""} className="w-40" />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="talent">
            Talent
          </label>
          <select
            id="talent"
            name="talent"
            defaultValue={sp.talent ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Tất cả</option>
            {talents.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="campaign">
            Campaign
          </label>
          <select
            id="campaign"
            name="campaign"
            defaultValue={sp.campaign ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Tất cả</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="review">
            Duyệt
          </label>
          <select
            id="review"
            name="review"
            defaultValue={sp.review ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Tất cả</option>
            {Object.entries(REVIEW_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="pipeline">
            Pipeline
          </label>
          <select
            id="pipeline"
            name="pipeline"
            defaultValue={sp.pipeline ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Tất cả</option>
            {Object.entries(PIPELINE_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="scalef">
            ScaleF
          </label>
          <select
            id="scalef"
            name="scalef"
            defaultValue={sp.scalef ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Tất cả</option>
            <option value="unsubmitted">Tech chưa nộp</option>
            <option value="awaiting">Đã nộp, chờ MM xác nhận</option>
            <option value="confirmed">MM đã xác nhận</option>
          </select>
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="cost">
            Chi phí
          </label>
          <select
            id="cost"
            name="cost"
            defaultValue={sp.cost ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Tất cả</option>
            <option value="missing">Chưa có chi phí</option>
          </select>
        </div>
        {user.role !== "MM" ? (
          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="mm">
              MM
            </label>
            <select
              id="mm"
              name="mm"
              defaultValue={sp.mm ?? ""}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Tất cả</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <Button type="submit" variant="secondary">
          Lọc
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        {total} video khớp bộ lọc{totalPages > 1 ? ` — trang ${page}/${totalPages}` : ""}
      </p>

      {sp.cost === "missing" && videos.length > 0 ? (
        <form
          id="bulk-cost-form"
          action={bulkSetProductionCost}
          className="flex flex-wrap items-end gap-3 rounded-md border bg-accent/30 p-3"
        >
          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="bulkProductionCost">
              Điền nhanh chi phí (VND) cho video đã chọn
            </label>
            <Input
              id="bulkProductionCost"
              name="productionCost"
              type="number"
              min={0}
              step={1000}
              required
              className="w-48"
            />
          </div>
          <Button type="submit">Áp dụng cho video đã chọn</Button>
        </form>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {sp.cost === "missing" ? <TableHead className="w-8" /> : null}
              <TableHead>Ngày air</TableHead>
              <TableHead>Talent</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Link</TableHead>
              <TableHead>Duyệt</TableHead>
              <TableHead>Pipeline</TableHead>
              <TableHead>Chi phí</TableHead>
              <TableHead>ScaleF</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {videos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  Chưa có video nào khớp bộ lọc
                </TableCell>
              </TableRow>
            ) : (
              videos.map((v) => (
                <TableRow key={v.id}>
                  {sp.cost === "missing" ? (
                    <TableCell>
                      {canReviewVideo(user, v.talent.managerId) ? (
                        <input type="checkbox" name="videoIds" value={v.id} form="bulk-cost-form" />
                      ) : null}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-sm whitespace-nowrap">{formatDate(v.airDate)}</TableCell>
                  <TableCell className="text-sm">{v.talent.fullName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {v.campaign?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    <a
                      href={v.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                      title={v.videoUrl}
                    >
                      {PLATFORM_LABELS[v.platform]}
                    </a>
                    {" · "}
                    <Link href={`/videos/${v.id}`} className="text-primary hover:underline">
                      chi tiết
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={v.reviewStatus === "APPROVED" ? "default" : "secondary"}>
                      {REVIEW_STATUS_LABELS[v.reviewStatus]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {PIPELINE_STATUS_LABELS[v.pipelineStatus]}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {v.productionCost != null ? (
                      formatVnd(v.productionCost)
                    ) : (
                      <Badge variant="destructive">Chưa điền</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {v.scalefSubmittedAt ? (
                      <>
                        <div>
                          Nộp: {v.scalefSubmittedBy?.fullName ?? "—"} ·{" "}
                          {formatDateTime(v.scalefSubmittedAt)}
                        </div>
                        <div className={v.scalefConfirmedAt ? "text-emerald-700" : "text-amber-700"}>
                          {v.scalefConfirmedAt
                            ? `Xác nhận: ${v.scalefConfirmedBy?.fullName ?? "—"} · ${formatDateTime(v.scalefConfirmedAt)}`
                            : "Chờ MM xác nhận"}
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Chưa nộp</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <VideoScalefActions user={user} video={v} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageLink(page - 1)}>← Trang trước</Link>
            </Button>
          ) : null}
          {page < totalPages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageLink(page + 1)}>Trang sau →</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Nút thao tác ScaleF hiện theo vai: Tech nộp, MM xác nhận.
function VideoScalefActions({
  user,
  video,
}: {
  user: SessionUser;
  video: {
    id: string;
    scalefSubmittedAt: Date | null;
    scalefConfirmedAt: Date | null;
    talent: { managerId: string };
  };
}) {
  const canSubmit = canEditPipeline(user);
  const canConfirm = canConfirmScalef(user, video.talent.managerId);

  return (
    <div className="flex justify-end gap-1">
      {canSubmit && !video.scalefSubmittedAt ? (
        <form action={submitToScalef.bind(null, video.id)}>
          <Button type="submit" size="sm" variant="secondary">
            Nộp ScaleF
          </Button>
        </form>
      ) : null}
      {canSubmit && video.scalefSubmittedAt ? (
        <form action={undoSubmitToScalef.bind(null, video.id)}>
          <Button type="submit" size="sm" variant="ghost">
            Gỡ nộp
          </Button>
        </form>
      ) : null}
      {canConfirm && video.scalefSubmittedAt && !video.scalefConfirmedAt ? (
        <form action={confirmScalefSubmission.bind(null, video.id)}>
          <Button type="submit" size="sm">
            Xác nhận
          </Button>
        </form>
      ) : null}
      {canConfirm && video.scalefConfirmedAt ? (
        <form action={undoConfirmScalef.bind(null, video.id)}>
          <Button type="submit" size="sm" variant="ghost">
            Bỏ xác nhận
          </Button>
        </form>
      ) : null}
      {canReviewVideo(user, video.talent.managerId) ? (
        <form action={deleteVideo.bind(null, video.id)}>
          <ConfirmSubmitButton
            size="sm"
            variant="ghost"
            className="text-destructive"
            confirmMessage="Xoá vĩnh viễn video này? Hành động này không thể hoàn tác."
          >
            Xoá
          </ConfirmSubmitButton>
        </form>
      ) : null}
    </div>
  );
}
