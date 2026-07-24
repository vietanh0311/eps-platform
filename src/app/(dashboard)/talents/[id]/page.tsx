import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canEditTalent, requireUser, talentScopeWhere } from "@/lib/authz";
import { addChannel, deleteChannel, deleteTalent, updateTalent } from "@/server/actions/talents";
import {
  createAffiliateLinkForTalent,
  toggleAffiliateLink,
  updateAffiliateLinkTarget,
} from "@/server/actions/affiliate-links";
import { TalentForm } from "@/components/talent-form";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { PLATFORM_LABELS, TALENT_STATUS_LABELS, formatVnd } from "@/lib/labels";
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

export default async function TalentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { error, saved } = await searchParams;

  // MM chỉ xem được Talent của mình (scope áp cả ở màn chi tiết)
  const talent = await prisma.talent.findFirst({
    where: { id, ...talentScopeWhere(user) },
    include: {
      manager: true,
      channels: { orderBy: { createdAt: "asc" } },
      _count: { select: { videos: true, assignments: true, payrollItems: true, bookingDeals: true } },
    },
  });
  if (!talent) notFound();

  const hasActivity =
    talent._count.videos > 0 ||
    talent._count.assignments > 0 ||
    talent._count.payrollItems > 0 ||
    talent._count.bookingDeals > 0;

  const editable = canEditTalent(user, talent.managerId);
  const affiliateLink = await prisma.affiliateLink.findFirst({
    where: { talentId: talent.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { clicks: true } } },
  });
  // Chỉ hiện MM đang hoạt động để chọn — nhưng vẫn giữ đúng MM hiện tại của Talent trong danh
  // sách dù MM đó đã bị khóa, để không hiện dropdown trống/sai giá trị đang chọn.
  const managers =
    user.role === "MM"
      ? [{ id: user.id, fullName: user.name }]
      : await prisma.user.findMany({
          where: { role: "MM", OR: [{ status: "ACTIVE" }, { id: talent.managerId }] },
          select: { id: true, fullName: true },
          orderBy: { fullName: "asc" },
        });

  const updateAction = updateTalent.bind(null, talent.id);
  const addChannelAction = addChannel.bind(null, talent.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{talent.fullName}</h1>
        <Badge variant={talent.status === "ACTIVE" ? "default" : "secondary"}>
          {TALENT_STATUS_LABELS[talent.status]}
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

      {editable ? (
        <TalentForm
          action={updateAction}
          talent={talent}
          managers={managers}
          submitLabel="Lưu thay đổi"
        />
      ) : (
        <dl className="grid max-w-xl grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <dt className="text-muted-foreground">Số điện thoại</dt>
          <dd>{talent.phone ?? "—"}</dd>
          <dt className="text-muted-foreground">Định hướng</dt>
          <dd>{talent.contentDirection ?? "—"}</dd>
          <dt className="text-muted-foreground">MM quản lý</dt>
          <dd>{talent.manager.fullName}</dd>
          <dt className="text-muted-foreground">Phí sản xuất/video</dt>
          <dd>{formatVnd(talent.productionFeePerVideo)}</dd>
          <dt className="text-muted-foreground">Tên ScaleF</dt>
          <dd>{talent.scalefUsername ?? "—"}</dd>
          <dt className="text-muted-foreground">Hashtag ScaleF</dt>
          <dd>{talent.scalefHashtag ?? "—"}</dd>
          <dt className="text-muted-foreground">MST / TK nhận tiền</dt>
          <dd>{talent.taxCode ?? "—"}</dd>
          <dt className="text-muted-foreground">Ghi chú</dt>
          <dd>{talent.notes ?? "—"}</dd>
        </dl>
      )}

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Kênh social</h2>
        <div className="max-w-3xl rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nền tảng</TableHead>
                <TableHead>Kênh</TableHead>
                <TableHead>Follower</TableHead>
                <TableHead>Kênh chính</TableHead>
                {editable ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {talent.channels.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={editable ? 5 : 4}
                    className="py-6 text-center text-muted-foreground"
                  >
                    Chưa có kênh nào
                  </TableCell>
                </TableRow>
              ) : (
                talent.channels.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{PLATFORM_LABELS[c.platform]}</TableCell>
                    <TableCell>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {c.handle}
                      </a>
                    </TableCell>
                    <TableCell>
                      {c.followerCount != null
                        ? new Intl.NumberFormat("vi-VN").format(c.followerCount)
                        : "—"}
                    </TableCell>
                    <TableCell>{c.isPrimary ? "✓" : ""}</TableCell>
                    {editable ? (
                      <TableCell className="text-right">
                        <form action={deleteChannel.bind(null, c.id)}>
                          <Button variant="ghost" size="sm" type="submit">
                            Xóa
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
          <form action={addChannelAction} className="flex max-w-3xl flex-wrap items-end gap-3">
            <div className="grid gap-1">
              <Label htmlFor="platform" className="text-xs">
                Nền tảng
              </Label>
              <select
                id="platform"
                name="platform"
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="handle" className="text-xs">
                Tên kênh
              </Label>
              <Input id="handle" name="handle" required className="w-40" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="url" className="text-xs">
                URL
              </Label>
              <Input id="url" name="url" type="url" required className="w-64" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="followerCount" className="text-xs">
                Follower
              </Label>
              <Input
                id="followerCount"
                name="followerCount"
                type="number"
                min={0}
                className="w-28"
              />
            </div>
            <label className="flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" name="isPrimary" value="true" /> Kênh chính
            </label>
            <Button type="submit" variant="secondary">
              Thêm kênh
            </Button>
          </form>
        ) : null}
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Link affiliate Dealverse</h2>
        {affiliateLink ? (
          <div className="max-w-xl space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <code className="rounded bg-muted px-2 py-1 text-xs">/go/{affiliateLink.slug}</code>
              <Badge variant={affiliateLink.isActive ? "default" : "secondary"}>
                {affiliateLink.isActive ? "Đang bật" : "Đã tắt"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Ghép thêm domain khi deploy thật, VD https://tenmien-cua-ban.com/go/{affiliateLink.slug}
            </p>
            <p>
              Đích hiện tại:{" "}
              <a
                href={affiliateLink.targetUrl}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                {affiliateLink.targetUrl}
              </a>
            </p>
            <p className="text-muted-foreground">
              Tổng số click: {affiliateLink._count.clicks.toLocaleString("vi-VN")} — xem chi tiết
              theo nguồn/thời gian ở{" "}
              <Link href="/affiliate" className="hover:underline">
                Aff link Dealverse
              </Link>
            </p>

            {editable ? (
              <div className="flex flex-wrap items-end gap-4 pt-1">
                <form action={toggleAffiliateLink.bind(null, affiliateLink.id)}>
                  <Button type="submit" variant="outline" size="sm">
                    {affiliateLink.isActive ? "Tắt link" : "Bật lại"}
                  </Button>
                </form>
                <form
                  action={updateAffiliateLinkTarget.bind(null, affiliateLink.id)}
                  className="flex items-end gap-2"
                >
                  <div className="grid gap-1">
                    <Label htmlFor="targetUrl" className="text-xs">
                      Sửa URL đích
                    </Label>
                    <Input
                      id="targetUrl"
                      name="targetUrl"
                      type="url"
                      defaultValue={affiliateLink.targetUrl}
                      className="w-80"
                    />
                  </div>
                  <Button type="submit" variant="secondary" size="sm">
                    Lưu
                  </Button>
                </form>
              </div>
            ) : null}
          </div>
        ) : editable ? (
          <form action={createAffiliateLinkForTalent.bind(null, talent.id)}>
            <Button type="submit" variant="secondary">
              Tạo link affiliate
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">Chưa có link affiliate</p>
        )}
      </section>

      {editable ? (
        <>
          <Separator />
          <section className="space-y-2">
            <h2 className="text-lg font-medium">Xoá Talent</h2>
            {hasActivity ? (
              <p className="max-w-xl text-sm text-muted-foreground">
                Talent này đã có video/campaign/lương liên quan nên không xoá được — đổi{" "}
                <strong>Trạng thái</strong> sang &quot;Dừng&quot; ở form phía trên nếu muốn ngừng
                hoạt động.
              </p>
            ) : (
              <form action={deleteTalent.bind(null, talent.id)}>
                <ConfirmSubmitButton
                  variant="destructive"
                  size="sm"
                  confirmMessage={`Xoá vĩnh viễn Talent "${talent.fullName}"? Hành động này không thể hoàn tác.`}
                >
                  Xoá Talent
                </ConfirmSubmitButton>
              </form>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
