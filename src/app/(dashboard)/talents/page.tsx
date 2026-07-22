import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, talentScopeWhere } from "@/lib/authz";
import { TALENT_STATUS_LABELS, PLATFORM_LABELS, formatVnd } from "@/lib/labels";
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
import type { Prisma, TalentStatus } from "@/generated/prisma/client";

export default async function TalentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; manager?: string }>;
}) {
  const user = await requireUser();
  const { q, status, manager } = await searchParams;

  const where: Prisma.TalentWhereInput = { ...talentScopeWhere(user) };
  if (status && status in TALENT_STATUS_LABELS) where.status = status as TalentStatus;
  if (manager && user.role !== "MM") where.managerId = manager;
  if (q) {
    where.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { channels: { some: { handle: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const [talents, managers] = await Promise.all([
    prisma.talent.findMany({
      where,
      include: { manager: true, channels: true },
      orderBy: { createdAt: "desc" },
    }),
    user.role === "MM"
      ? Promise.resolve([])
      : prisma.user.findMany({ where: { role: "MM" }, orderBy: { fullName: "asc" } }),
  ]);

  const canCreate = user.role === "CFO" || user.role === "MM";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Talent</h1>
          <p className="text-sm text-muted-foreground">
            {user.role === "MM" ? "Talent do bạn quản lý" : "Toàn bộ Talent trong hệ thống"}
          </p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href="/talents/new">+ Thêm Talent</Link>
          </Button>
        ) : null}
      </div>

      <form className="flex flex-wrap items-end gap-3" method="GET">
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="q">
            Tìm theo tên / kênh
          </label>
          <Input id="q" name="q" defaultValue={q ?? ""} className="w-56" />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="status">
            Trạng thái
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Tất cả</option>
            {Object.entries(TALENT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {user.role !== "MM" ? (
          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="manager">
              MM quản lý
            </label>
            <select
              id="manager"
              name="manager"
              defaultValue={manager ?? ""}
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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Họ tên</TableHead>
              <TableHead>Kênh</TableHead>
              <TableHead>Định hướng</TableHead>
              <TableHead>MM quản lý</TableHead>
              <TableHead>Phí/video</TableHead>
              <TableHead>Trạng thái</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {talents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Chưa có Talent nào khớp bộ lọc
                </TableCell>
              </TableRow>
            ) : (
              talents.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link href={`/talents/${t.id}`} className="font-medium hover:underline">
                      {t.fullName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t.channels.length === 0
                      ? "—"
                      : t.channels
                          .map((c) => `${PLATFORM_LABELS[c.platform]}: ${c.handle}`)
                          .join(", ")}
                  </TableCell>
                  <TableCell className="text-sm">{t.contentDirection ?? "—"}</TableCell>
                  <TableCell className="text-sm">{t.manager.fullName}</TableCell>
                  <TableCell className="text-sm">{formatVnd(t.productionFeePerVideo)}</TableCell>
                  <TableCell>
                    <Badge variant={t.status === "ACTIVE" ? "default" : "secondary"}>
                      {TALENT_STATUS_LABELS[t.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
