import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { campaignScopeWhere, requireUser } from "@/lib/authz";
import { CAMPAIGN_STATUS_LABELS, formatDate, formatVnd } from "@/lib/labels";
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
import type { CampaignStatus, Prisma } from "@/generated/prisma/client";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; mm?: string }>;
}) {
  const user = await requireUser();
  const { q, status, mm } = await searchParams;

  const where: Prisma.CampaignWhereInput = { ...campaignScopeWhere(user) };
  if (status && status in CAMPAIGN_STATUS_LABELS) where.status = status as CampaignStatus;
  if (mm && user.role !== "MM") where.mmId = mm;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { brandName: { contains: q, mode: "insensitive" } },
    ];
  }

  const [campaigns, managers] = await Promise.all([
    prisma.campaign.findMany({
      where,
      include: { mm: true, _count: { select: { assignments: true, videos: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
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
          <h1 className="text-2xl font-semibold">Campaign / Brief</h1>
          <p className="text-sm text-muted-foreground">
            {user.role === "MM"
              ? "Campaign bạn phụ trách"
              : user.role === "TECH"
                ? "Toàn bộ campaign (chỉ đọc)"
                : "Toàn bộ campaign trong hệ thống"}
          </p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href="/campaigns/new">+ Tạo campaign</Link>
          </Button>
        ) : null}
      </div>

      <form className="flex flex-wrap items-end gap-3" method="GET">
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="q">
            Tìm theo tên / nhãn hàng
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
            {Object.entries(CAMPAIGN_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {user.role !== "MM" ? (
          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="mm">
              MM phụ trách
            </label>
            <select
              id="mm"
              name="mm"
              defaultValue={mm ?? ""}
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
              <TableHead>Campaign</TableHead>
              <TableHead>Nhãn hàng</TableHead>
              <TableHead>MM</TableHead>
              <TableHead>Thời gian</TableHead>
              <TableHead className="text-right">Talent</TableHead>
              <TableHead className="text-right">Video</TableHead>
              <TableHead className="text-right">Booking</TableHead>
              <TableHead>Trạng thái</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  Chưa có campaign nào khớp bộ lọc
                </TableCell>
              </TableRow>
            ) : (
              campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/campaigns/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{c.brandName}</TableCell>
                  <TableCell className="text-sm">
                    {c.mm ? c.mm.fullName : <span className="text-muted-foreground">Chưa nhận</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.startDate || c.endDate
                      ? `${formatDate(c.startDate)} → ${formatDate(c.endDate)}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm">{c._count.assignments}</TableCell>
                  <TableCell className="text-right text-sm">{c._count.videos}</TableCell>
                  <TableCell className="text-right text-sm">
                    {c.contractValue != null ? formatVnd(c.contractValue) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.status === "RUNNING" ? "default" : "secondary"}>
                      {CAMPAIGN_STATUS_LABELS[c.status]}
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
