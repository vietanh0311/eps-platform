import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  campaignScopeWhere,
  canEditCampaign,
  canJoinCampaignManager,
  requireUser,
  talentScopeWhere,
} from "@/lib/authz";
import { isSystemAdmin } from "@/lib/roles";
import {
  assignTalent,
  joinCampaignManager,
  removeAssignment,
  removeCampaignManager,
  updateAssignmentStatus,
  updateCampaign,
} from "@/server/actions/campaigns";
import { upsertCampaignRewardTerms } from "@/server/actions/payroll";
import { parseScalefReward } from "@/server/campaigns/scalef-policy";
import { CampaignForm } from "@/components/campaign-form";
import {
  ASSIGNMENT_STATUS_LABELS,
  CAMPAIGN_SOURCE_LABELS,
  CAMPAIGN_STATUS_LABELS,
  PIPELINE_STATUS_LABELS,
  REVIEW_STATUS_LABELS,
  formatDate,
  formatVnd,
  stripHtml,
} from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AssignmentStatus } from "@/generated/prisma/enums";

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; merged?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { error, saved, merged } = await searchParams;

  // MM chỉ xem được campaign của mình (scope áp cả ở màn chi tiết)
  const campaign = await prisma.campaign.findFirst({
    where: { id, ...campaignScopeWhere(user) },
    include: {
      managers: { include: { user: { select: { id: true, fullName: true } } } },
      mergedInto: { select: { id: true, name: true } },
      scalefEvent: { select: { name: true, raw: true } },
      assignments: {
        include: { talent: { include: { manager: true } }, assignedBy: true },
        orderBy: { createdAt: "asc" },
      },
      videos: {
        include: { talent: true },
        orderBy: { airDate: "desc" },
        take: 50,
      },
    },
  });
  if (!campaign) notFound();

  const managerUserIds = campaign.managers.map((m) => m.userId);
  const editable = canEditCampaign(user, managerUserIds, campaign.mergedIntoId);
  // Vấn đề 2 — MM tự "Cùng quản lý" (tự phục vụ, không cần CFO duyệt); system admin thêm được
  // bất kỳ MM nào chưa có trong danh sách qua <select>. Gỡ MM chỉ system admin (canRemoveCampaignManager).
  const currentManagerIds = new Set(managerUserIds);
  const canJoinSelf = canJoinCampaignManager(user, user.id, campaign) && !currentManagerIds.has(user.id);
  const allMms =
    user.role === "MM"
      ? [{ id: user.id, fullName: user.name }]
      : await prisma.user.findMany({
          where: { role: "MM" },
          select: { id: true, fullName: true },
          orderBy: { fullName: "asc" },
        });
  const joinableMms = isSystemAdmin(user.role) ? allMms.filter((m) => !currentManagerIds.has(m.id)) : [];

  // Vấn đề 1 — gợi ý pricePerView từ ScaleF event đã liên kết (chỉ khi chưa có giá riêng).
  const scalefEventRaw = campaign.scalefEvent?.raw as { reward?: string } | null | undefined;
  const scalefReward = scalefEventRaw ? parseScalefReward(scalefEventRaw.reward) : null;
  const scalefSuggestedPrice =
    campaign.pricePerView == null && scalefReward?.kind === "per_view" ? scalefReward.value : null;

  // Talent được phép giao: MM chỉ thấy Talent mình quản lý.
  const assignableTalents = editable
    ? await prisma.talent.findMany({
        where: { ...talentScopeWhere(user), status: "ACTIVE" },
        select: { id: true, fullName: true },
        orderBy: { fullName: "asc" },
      })
    : [];
  const assignedIds = new Set(campaign.assignments.map((a) => a.talentId));
  const freeTalents = assignableTalents.filter((t) => !assignedIds.has(t.id));

  const updateAction = updateCampaign.bind(null, campaign.id);
  const assignAction = assignTalent.bind(null, campaign.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{campaign.name}</h1>
        <Badge variant={campaign.status === "RUNNING" ? "default" : "secondary"}>
          {CAMPAIGN_STATUS_LABELS[campaign.status]}
        </Badge>
      </div>

      {error ? (
        <p className="max-w-xl rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="max-w-xl rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          Đã lưu thay đổi
        </p>
      ) : null}
      {merged ? (
        <p className="max-w-xl rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          Đã gộp campaign khác vào đây thành công.
        </p>
      ) : null}

      {campaign.mergedInto ? (
        <p className="max-w-xl rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
          Campaign này đã gộp vào{" "}
          <Link href={`/campaigns/${campaign.mergedInto.id}`} className="font-medium underline">
            {campaign.mergedInto.name}
          </Link>{" "}
          — chỉ đọc, video/Talent giao trước đó đã chuyển sang campaign đích.
        </p>
      ) : null}

      {editable ? (
        <CampaignForm
          action={updateAction}
          campaign={campaign}
          managers={allMms}
          submitLabel="Lưu thay đổi"
        />
      ) : (
        <div className="max-w-2xl space-y-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Nhãn hàng</dt>
            <dd>{campaign.brandName}</dd>
            <dt className="text-muted-foreground">Nguồn</dt>
            <dd>{CAMPAIGN_SOURCE_LABELS[campaign.source]}</dd>
            <dt className="text-muted-foreground">Thời gian</dt>
            <dd>
              {formatDate(campaign.startDate)} → {formatDate(campaign.endDate)}
            </dd>
            <dt className="text-muted-foreground">Giá trị booking</dt>
            <dd>{campaign.contractValue != null ? formatVnd(campaign.contractValue) : "—"}</dd>
            <dt className="text-muted-foreground">Link thể lệ</dt>
            <dd>
              {campaign.sourceUrl ? (
                <a href={campaign.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">
                  Mở thể lệ gốc
                </a>
              ) : (
                "—"
              )}
            </dd>
            <dt className="text-muted-foreground">Brief</dt>
            <dd className="whitespace-pre-wrap">{campaign.brief ?? "—"}</dd>
            <dt className="text-muted-foreground">Ghi chú</dt>
            <dd>{campaign.notes ?? "—"}</dd>
          </dl>

          {campaign.descHtml ? (
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Mô tả từ Ambassador</p>
              {/* desc_html là dữ liệu ngoài — strip toàn bộ tag, KHÔNG dangerouslySetInnerHTML
                  (chèn <script> là chiếm được phiên CFO, rủi ro thật). Xem thể lệ gốc qua link ở trên. */}
              <p className="whitespace-pre-wrap text-sm">{stripHtml(campaign.descHtml)}</p>
            </div>
          ) : null}
        </div>
      )}

      <Separator />

      {/* Vấn đề 2 — campaign hỗ trợ NHIỀU MM cùng phụ trách. Tự phục vụ: bất kỳ MM nào cũng tự
          "Cùng quản lý" được (không cần CFO duyệt); gỡ MM chỉ system admin làm được (việc nhạy
          cảm hơn — CFO xác nhận qua Plan Mode). Tách hẳn khỏi CampaignForm để không lẫn 2 quyền
          khác nhau trong cùng 1 field sửa chung. */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">MM phụ trách</h2>
        <div className="max-w-md rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>MM</TableHead>
                {isSystemAdmin(user.role) ? <TableHead className="text-right">Gỡ</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaign.managers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isSystemAdmin(user.role) ? 2 : 1}
                    className="py-4 text-center text-muted-foreground"
                  >
                    Chưa nhận
                  </TableCell>
                </TableRow>
              ) : (
                campaign.managers.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.user.fullName}</TableCell>
                    {isSystemAdmin(user.role) ? (
                      <TableCell className="text-right">
                        <form action={removeCampaignManager.bind(null, campaign.id, m.userId)}>
                          <Button variant="ghost" size="sm" type="submit">
                            Gỡ
                          </Button>
                        </form>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {canJoinSelf ? (
          <form action={joinCampaignManager.bind(null, campaign.id)}>
            <Button type="submit" variant="secondary">
              Cùng quản lý campaign này
            </Button>
          </form>
        ) : null}
        {isSystemAdmin(user.role) && joinableMms.length > 0 && !campaign.mergedIntoId ? (
          <form action={joinCampaignManager.bind(null, campaign.id)} className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1">
              <Label htmlFor="mmId" className="text-xs">
                Thêm MM khác
              </Label>
              <select
                id="mmId"
                name="mmId"
                required
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {joinableMms.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="secondary">
              Thêm
            </Button>
          </form>
        ) : null}
      </section>

      {isSystemAdmin(user.role) && !campaign.mergedInto ? (
        <>
          <Separator />
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-medium">Cơ chế thưởng MM</h2>
              <p className="text-sm text-muted-foreground">
                Dùng để tính commission MM ở mục Lương & thưởng — để trống thì campaign này bị bỏ
                qua khi tính nháp (không tính bừa).
              </p>
              {scalefSuggestedPrice != null ? (
                <p className="mt-1 text-xs text-emerald-700">
                  ScaleF gợi ý: {scalefSuggestedPrice}đ/view (từ event &quot;{campaign.scalefEvent?.name}
                  &quot;) — đã điền sẵn bên dưới, bấm &quot;Lưu cơ chế&quot; để áp dụng thật.
                </p>
              ) : null}
            </div>
            <form
              action={upsertCampaignRewardTerms.bind(null, campaign.id)}
              className="flex max-w-2xl flex-wrap items-end gap-3"
            >
              <div className="grid gap-1">
                <Label htmlFor="pricePerView" className="text-xs">
                  Đồng/view
                </Label>
                <Input
                  id="pricePerView"
                  name="pricePerView"
                  type="number"
                  min={0}
                  className="w-32"
                  defaultValue={campaign.pricePerView ?? scalefSuggestedPrice ?? ""}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="fixedCostPerView" className="text-xs">
                  Chi phí cố định/view
                </Label>
                <Input
                  id="fixedCostPerView"
                  name="fixedCostPerView"
                  type="number"
                  min={0}
                  className="w-40"
                  defaultValue={campaign.fixedCostPerView ?? ""}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="costCeilingPct" className="text-xs">
                  % chi phí max (để trống = tự tra tier theo đồng/view)
                </Label>
                <Input
                  id="costCeilingPct"
                  name="costCeilingPct"
                  type="number"
                  min={0}
                  max={100}
                  className="w-32"
                  defaultValue={campaign.costCeilingPct ?? ""}
                />
              </div>
              <Button type="submit" variant="secondary">
                Lưu cơ chế
              </Button>
            </form>
          </section>
        </>
      ) : null}

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Talent được giao</h2>
        <div className="max-w-4xl rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Talent</TableHead>
                <TableHead>MM quản lý</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead>Ghi chú</TableHead>
                <TableHead>Trạng thái</TableHead>
                {editable ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaign.assignments.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={editable ? 6 : 5}
                    className="py-6 text-center text-muted-foreground"
                  >
                    Chưa giao Talent nào
                  </TableCell>
                </TableRow>
              ) : (
                campaign.assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link href={`/talents/${a.talentId}`} className="font-medium hover:underline">
                        {a.talent.fullName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{a.talent.manager.fullName}</TableCell>
                    <TableCell className="text-sm">{formatDate(a.deadline)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.note ?? "—"}</TableCell>
                    <TableCell>
                      {editable ? (
                        <div className="flex flex-wrap gap-1">
                          {(Object.keys(ASSIGNMENT_STATUS_LABELS) as AssignmentStatus[]).map((s) => (
                            <form key={s} action={updateAssignmentStatus.bind(null, a.id, s)}>
                              <Button
                                type="submit"
                                size="sm"
                                variant={a.status === s ? "default" : "outline"}
                              >
                                {ASSIGNMENT_STATUS_LABELS[s]}
                              </Button>
                            </form>
                          ))}
                        </div>
                      ) : (
                        <Badge variant="secondary">{ASSIGNMENT_STATUS_LABELS[a.status]}</Badge>
                      )}
                    </TableCell>
                    {editable ? (
                      <TableCell className="text-right">
                        <form action={removeAssignment.bind(null, a.id)}>
                          <Button variant="ghost" size="sm" type="submit">
                            Gỡ
                          </Button>
                        </form>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {editable ? (
          freeTalents.length > 0 ? (
            <form action={assignAction} className="flex max-w-4xl flex-wrap items-end gap-3">
              <div className="grid gap-1">
                <Label htmlFor="talentId" className="text-xs">
                  Talent
                </Label>
                <select
                  id="talentId"
                  name="talentId"
                  required
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  {freeTalents.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="deadline" className="text-xs">
                  Deadline
                </Label>
                <Input id="deadline" name="deadline" type="date" className="w-40" />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="note" className="text-xs">
                  Ghi chú
                </Label>
                <Input id="note" name="note" className="w-64" placeholder="VD: 2 video, ưu tiên TikTok" />
              </div>
              <Button type="submit" variant="secondary">
                Giao Talent
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Đã giao hết Talent bạn quản lý cho campaign này.
            </p>
          )
        ) : null}
      </section>

      <Separator />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Video thuộc campaign</h2>
          <Link
            href={`/videos?campaign=${campaign.id}`}
            className="text-sm text-primary underline underline-offset-4"
          >
            → Xem trong Log video
          </Link>
        </div>
        <div className="max-w-4xl rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ngày air</TableHead>
                <TableHead>Talent</TableHead>
                <TableHead>Link</TableHead>
                <TableHead>Duyệt</TableHead>
                <TableHead>Pipeline</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaign.videos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    Chưa có video nào
                  </TableCell>
                </TableRow>
              ) : (
                campaign.videos.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="text-sm">{formatDate(v.airDate)}</TableCell>
                    <TableCell className="text-sm">{v.talent.fullName}</TableCell>
                    <TableCell className="text-sm">
                      <Link href={`/videos/${v.id}`} className="hover:underline">
                        Chi tiết
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{REVIEW_STATUS_LABELS[v.reviewStatus]}</TableCell>
                    <TableCell className="text-sm">
                      {PIPELINE_STATUS_LABELS[v.pipelineStatus]}
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
