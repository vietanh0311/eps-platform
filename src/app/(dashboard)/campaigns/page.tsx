import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { campaignScopeWhere, requireUser } from "@/lib/authz";
import { isSystemAdmin } from "@/lib/roles";
import { syncAmbassadorNow } from "@/server/actions/campaigns";
import { findMatchCandidates } from "@/server/campaigns/matching";
import { findScalefPolicyCandidates } from "@/server/campaigns/scalef-policy";
import {
  CAMPAIGN_SOURCE_LABELS,
  CAMPAIGN_STATUS_LABELS,
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
import type { CampaignStatus, Prisma } from "@/generated/prisma/client";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    mm?: string;
    claim?: string;
    synced?: string;
    error?: string;
    showMerged?: string;
  }>;
}) {
  const user = await requireUser();
  const { q, status, mm, claim, synced, error, showMerged } = await searchParams;

  const where: Prisma.CampaignWhereInput = { ...campaignScopeWhere(user) };
  if (!showMerged) where.mergedIntoId = null;
  if (status && status in CAMPAIGN_STATUS_LABELS) where.status = status as CampaignStatus;
  if (mm && user.role !== "MM") where.managers = { some: { userId: mm } };
  if (claim === "mine") where.managers = { some: { userId: user.id } };
  if (claim === "unclaimed") where.managers = { none: {} };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { brandName: { contains: q, mode: "insensitive" } },
    ];
  }

  const [campaigns, managers, lastSync, matchCandidateCount, scalefPolicyCandidateCount] = await Promise.all([
    prisma.campaign.findMany({
      where,
      include: {
        managers: { include: { user: { select: { fullName: true } } } },
        _count: { select: { assignments: true, videos: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    user.role === "MM"
      ? Promise.resolve([])
      : prisma.user.findMany({ where: { role: "MM" }, orderBy: { fullName: "asc" } }),
    prisma.syncRun.findFirst({
      where: { source: "ambassador_campaigns" },
      orderBy: { startedAt: "desc" },
    }),
    // Vấn đề 3 — chỉ system admin cần biết còn bao nhiêu cặp MANUAL↔AMBASSADOR chưa duyệt.
    isSystemAdmin(user.role) ? findMatchCandidates().then((c) => c.length) : Promise.resolve(0),
    // Vấn đề 1 — chỉ system admin cần biết còn bao nhiêu cặp Campaign↔ScaleF Event chưa duyệt.
    isSystemAdmin(user.role) ? findScalefPolicyCandidates().then((c) => c.length) : Promise.resolve(0),
  ]);

  const canCreate = isSystemAdmin(user.role) || user.role === "MM";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Campaign / Brief</h1>
          <p className="text-sm text-muted-foreground">
            {user.role === "MM" ? "Campaign bạn phụ trách" : "Toàn bộ campaign trong hệ thống"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSystemAdmin(user.role) && matchCandidateCount > 0 ? (
            <Button asChild variant="outline">
              <Link href="/campaigns/matching">{matchCandidateCount} cặp nghi ngờ trùng cần duyệt</Link>
            </Button>
          ) : null}
          {isSystemAdmin(user.role) && scalefPolicyCandidateCount > 0 ? (
            <Button asChild variant="outline">
              <Link href="/campaigns/scalef-policy">
                {scalefPolicyCandidateCount} campaign chưa liên kết ScaleF event
              </Link>
            </Button>
          ) : null}
          <form action={syncAmbassadorNow}>
            <Button type="submit" variant="outline">
              Đồng bộ Ambassador ngay
            </Button>
          </form>
          {canCreate ? (
            <Button asChild>
              <Link href="/campaigns/new">+ Tạo campaign</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {lastSync
          ? `Đồng bộ Ambassador lần cuối ${formatDateTime(lastSync.startedAt)} — ${lastSync.ok ? `OK, ${lastSync.items} campaign` : `Lỗi: ${lastSync.error}`}`
          : "Chưa đồng bộ Ambassador lần nào."}
      </p>
      {synced ? (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          Đồng bộ xong — {synced} campaign.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Link
          href="/campaigns?claim=mine"
          className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
        >
          Của tôi
        </Link>
        <Link
          href="/campaigns?claim=unclaimed"
          className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
        >
          Chưa nhận
        </Link>
        <Link href="/campaigns" className="rounded-md border px-3 py-2 text-sm hover:bg-accent">
          Tất cả
        </Link>
        {isSystemAdmin(user.role) ? (
          <Link
            href={showMerged ? "/campaigns" : "/campaigns?showMerged=1"}
            className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
          >
            {showMerged ? "Ẩn campaign đã gộp" : "Xem cả campaign đã gộp"}
          </Link>
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
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="claim">
            Nhận việc
          </label>
          <select
            id="claim"
            name="claim"
            defaultValue={claim ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Tất cả</option>
            <option value="mine">Của tôi</option>
            <option value="unclaimed">Chưa nhận</option>
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
              <TableHead>Nguồn</TableHead>
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
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
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
                  <TableCell className="text-xs">
                    <Badge variant="outline">{CAMPAIGN_SOURCE_LABELS[c.source]}</Badge>
                    {c.mergedIntoId ? (
                      <Badge variant="secondary" className="ml-1">
                        Đã gộp
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.managers.length > 0 ? (
                      c.managers.map((m) => m.user.fullName).join(", ")
                    ) : (
                      <span className="text-muted-foreground">Chưa nhận</span>
                    )}
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
