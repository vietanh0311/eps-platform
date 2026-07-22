import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canEditTalent, requireUser, talentScopeWhere } from "@/lib/authz";
import { addChannel, deleteChannel, updateTalent } from "@/server/actions/talents";
import { TalentForm } from "@/components/talent-form";
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
    include: { manager: true, channels: { orderBy: { createdAt: "asc" } } },
  });
  if (!talent) notFound();

  const editable = canEditTalent(user, talent.managerId);
  const managers =
    user.role === "MM"
      ? [{ id: user.id, fullName: user.name }]
      : await prisma.user.findMany({
          where: { role: "MM" },
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
    </div>
  );
}
