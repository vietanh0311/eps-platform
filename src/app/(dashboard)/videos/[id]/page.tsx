import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  canConfirmScalef,
  canEditPipeline,
  canReviewVideo,
  requireUser,
  talentScopeWhere,
  videoScopeWhere,
} from "@/lib/authz";
import {
  advancePipeline,
  confirmScalefSubmission,
  deleteVideo,
  submitToScalef,
  undoConfirmScalef,
  undoSubmitToScalef,
  updateVideo,
} from "@/server/actions/videos";
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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import type { PipelineStatus } from "@/generated/prisma/enums";

// Bước cuối SENT_SCALEF đi qua nút "Nộp lên ScaleF" riêng để luôn ghi kèm ai/lúc nào đã nộp.
const TECH_STEPS: PipelineStatus[] = ["NOT_IN_PIPELINE", "RECEIVED", "ADS_DONE", "ENGAGEMENT_DONE"];

export default async function VideoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { error, saved } = await searchParams;

  const video = await prisma.video.findFirst({
    where: { id, ...(videoScopeWhere(user) as object) },
    include: {
      talent: { include: { manager: true } },
      campaign: true,
      loggedBy: { select: { fullName: true } },
      scalefSubmittedBy: { select: { fullName: true } },
      scalefConfirmedBy: { select: { fullName: true } },
      pipelineEvents: {
        include: { byUser: { select: { fullName: true } } },
        orderBy: { at: "desc" },
      },
    },
  });
  if (!video) notFound();

  const editable = canReviewVideo(user, video.talent.managerId);
  const pipelineEditable = canEditPipeline(user);
  const confirmable = canConfirmScalef(user, video.talent.managerId);

  const campaigns = editable
    ? await prisma.campaign.findMany({
        where: user.role === "MM" ? { mmId: user.id } : {},
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];
  // Giữ campaign hiện tại trong danh sách kể cả khi nó do MM khác phụ trách.
  const campaignOptions =
    video.campaign && !campaigns.some((c) => c.id === video.campaignId)
      ? [{ id: video.campaign.id, name: video.campaign.name }, ...campaigns]
      : campaigns;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Video {formatDate(video.airDate)}</h1>
        <Badge variant={video.reviewStatus === "APPROVED" ? "default" : "secondary"}>
          {REVIEW_STATUS_LABELS[video.reviewStatus]}
        </Badge>
        <Badge variant="outline">{PIPELINE_STATUS_LABELS[video.pipelineStatus]}</Badge>
        <Link href="/videos" className="text-sm text-primary underline underline-offset-4">
          ← Về danh sách
        </Link>
      </div>

      {error ? (
        <p className="max-w-2xl rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="max-w-2xl rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          Đã lưu thay đổi
        </p>
      ) : null}

      <dl className="grid max-w-2xl grid-cols-[10rem_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Talent</dt>
        <dd>
          <Link href={`/talents/${video.talentId}`} className="hover:underline">
            {video.talent.fullName}
          </Link>{" "}
          <span className="text-muted-foreground">— MM {video.talent.manager.fullName}</span>
        </dd>
        <dt className="text-muted-foreground">Nền tảng</dt>
        <dd>{PLATFORM_LABELS[video.platform]}</dd>
        <dt className="text-muted-foreground">Link</dt>
        <dd className="break-all">
          <a href={video.videoUrl} target="_blank" rel="noreferrer" className="hover:underline">
            {video.videoUrl}
          </a>
        </dd>
        <dt className="text-muted-foreground">Người log</dt>
        <dd>{video.loggedBy.fullName}</dd>
        <dt className="text-muted-foreground">Chi phí sản xuất</dt>
        <dd>
          {video.productionCost != null ? (
            formatVnd(video.productionCost)
          ) : (
            <Badge variant="destructive">⚠ Chưa điền chi phí</Badge>
          )}
        </dd>
        {video.airClipCode ? (
          <>
            <dt className="text-muted-foreground">Mã air clip</dt>
            <dd>{video.airClipCode}</dd>
          </>
        ) : null}
      </dl>

      <Separator />

      {/* Luồng 3: Tech nộp ScaleF -> MM xác nhận */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Nộp lên ScaleF</h2>
        <div className="max-w-2xl rounded-md border p-4 text-sm">
          <div className="grid grid-cols-[10rem_1fr] gap-x-6 gap-y-2">
            <span className="text-muted-foreground">Tech đã nộp</span>
            <span>
              {video.scalefSubmittedAt
                ? `${video.scalefSubmittedBy?.fullName ?? "—"} · ${formatDateTime(video.scalefSubmittedAt)}`
                : "Chưa nộp"}
            </span>
            <span className="text-muted-foreground">MM xác nhận</span>
            <span className={video.scalefConfirmedAt ? "text-emerald-700" : "text-amber-700"}>
              {video.scalefConfirmedAt
                ? `${video.scalefConfirmedBy?.fullName ?? "—"} · ${formatDateTime(video.scalefConfirmedAt)}`
                : video.scalefSubmittedAt
                  ? "Chờ MM xác nhận"
                  : "—"}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {pipelineEditable && !video.scalefSubmittedAt ? (
              <form action={submitToScalef.bind(null, video.id)}>
                <Button type="submit" size="sm">
                  Nộp lên ScaleF
                </Button>
              </form>
            ) : null}
            {pipelineEditable && video.scalefSubmittedAt ? (
              <form action={undoSubmitToScalef.bind(null, video.id)}>
                <Button type="submit" size="sm" variant="outline">
                  Gỡ trạng thái đã nộp
                </Button>
              </form>
            ) : null}
            {confirmable && video.scalefSubmittedAt && !video.scalefConfirmedAt ? (
              <form action={confirmScalefSubmission.bind(null, video.id)}>
                <Button type="submit" size="sm">
                  Xác nhận đã nộp
                </Button>
              </form>
            ) : null}
            {confirmable && video.scalefConfirmedAt ? (
              <form action={undoConfirmScalef.bind(null, video.id)}>
                <Button type="submit" size="sm" variant="outline">
                  Bỏ xác nhận
                </Button>
              </form>
            ) : null}
            {!pipelineEditable && !confirmable ? (
              <p className="text-xs text-muted-foreground">
                Bạn không có quyền thao tác ở bước này.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <Separator />

      {/* Luồng 2: pipeline của team Tech */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Pipeline team Tech</h2>
        {pipelineEditable ? (
          <div className="flex flex-wrap gap-2">
            {TECH_STEPS.map((s) => (
              <form key={s} action={advancePipeline.bind(null, video.id, s)}>
                <Button
                  type="submit"
                  size="sm"
                  variant={video.pipelineStatus === s ? "default" : "outline"}
                >
                  {PIPELINE_STATUS_LABELS[s]}
                </Button>
              </form>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Chỉ Team Tech / Team Finance cập nhật được pipeline.
          </p>
        )}

        <div className="max-w-2xl rounded-md border">
          {video.pipelineEvents.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Chưa có thay đổi pipeline nào.</p>
          ) : (
            <ul className="divide-y text-sm">
              {video.pipelineEvents.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 p-3">
                  <span className="font-medium">
                    {PIPELINE_STATUS_LABELS[e.fromStatus]} → {PIPELINE_STATUS_LABELS[e.toStatus]}
                  </span>
                  <span className="text-muted-foreground">
                    {e.byUser.fullName} · {formatDateTime(e.at)}
                  </span>
                  {e.note ? <span className="text-muted-foreground">— {e.note}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <Separator />

      {/* Luồng 1: MM duyệt nội dung */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Nội dung &amp; duyệt (MM)</h2>
        {editable ? (
          <form action={updateVideo.bind(null, video.id)} className="grid max-w-2xl gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="airDate">Ngày air</Label>
                <Input
                  id="airDate"
                  name="airDate"
                  type="date"
                  required
                  defaultValue={video.airDate.toISOString().slice(0, 10)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="campaignId">Campaign</Label>
                <select
                  id="campaignId"
                  name="campaignId"
                  defaultValue={video.campaignId ?? ""}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
                >
                  <option value="">(Không thuộc campaign nào)</option>
                  {campaignOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="reviewStatus">Trạng thái duyệt</Label>
                <select
                  id="reviewStatus"
                  name="reviewStatus"
                  defaultValue={video.reviewStatus}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
                >
                  {Object.entries(REVIEW_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="productionCost">Chi phí sản xuất (VND) *</Label>
                <Input
                  id="productionCost"
                  name="productionCost"
                  type="number"
                  min={0}
                  step={1000}
                  required
                  defaultValue={video.productionCost ?? ""}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="briefComment">Brief comment</Label>
              <Textarea
                id="briefComment"
                name="briefComment"
                rows={3}
                defaultValue={video.briefComment ?? ""}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="feedback">Feedback của MM</Label>
              <Textarea id="feedback" name="feedback" rows={3} defaultValue={video.feedback ?? ""} />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Lưu thay đổi</Button>
            </div>
          </form>
        ) : (
          <dl className="grid max-w-2xl grid-cols-[10rem_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Campaign</dt>
            <dd>{video.campaign?.name ?? "—"}</dd>
            <dt className="text-muted-foreground">Brief comment</dt>
            <dd className="whitespace-pre-wrap">{video.briefComment ?? "—"}</dd>
            <dt className="text-muted-foreground">Feedback</dt>
            <dd className="whitespace-pre-wrap">{video.feedback ?? "—"}</dd>
          </dl>
        )}
      </section>

      {editable ? (
        <form action={deleteVideo.bind(null, video.id)}>
          <ConfirmSubmitButton
            variant="ghost"
            size="sm"
            className="text-destructive"
            confirmMessage="Xoá vĩnh viễn video này? Hành động này không thể hoàn tác."
          >
            Xóa video này
          </ConfirmSubmitButton>
        </form>
      ) : null}
    </div>
  );
}
