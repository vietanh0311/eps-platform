import { prisma } from "@/lib/prisma";
import { requireRole, talentScopeWhere } from "@/lib/authz";
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
import type { Prisma } from "@/generated/prisma/client";

// Màn CFO/MM đối soát performance link affiliate Dealverse — theo Talent, theo nguồn, theo ngày.
// Quy mô hiện tại còn nhỏ (vài chục Talent, tính năng mới ra mắt) nên gom 1 query rồi aggregate
// trong JS cho cả 3 chiều, không cần groupBy SQL riêng từng chiều.
const CLICK_QUERY_LIMIT = 20000;
const VN_TZ = "Asia/Ho_Chi_Minh";
const vnDateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ });

function vnDateStr(date: Date): string {
  return vnDateFormatter.format(date);
}

function defaultToStr(): string {
  return vnDateStr(new Date());
}

function defaultFromStr(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 30);
  return vnDateStr(d);
}

// Chuỗi "YYYY-MM-DD" (khung giờ VN) sang mốc thời gian thật để lọc DB — cộng trừ giờ VN cố định
// +07:00 (giống cách xử lý múi giờ đã dùng ở sync Ambassador, tránh bẫy lệch ngày UTC).
function startOfVnDay(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+07:00`);
}
function endOfVnDay(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999+07:00`);
}

// "YYYY-MM-DD" -> "DD/MM/YYYY" bằng thao tác chuỗi thuần, không dựng lại Date (tránh diễn giải
// lại múi giờ lần 2 — ngày đã đúng khung VN từ vnDateStr rồi).
function toVnDisplayDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

export default async function AffiliatePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; talentId?: string }>;
}) {
  const user = await requireRole("CFO", "MM");
  const sp = await searchParams;

  const fromStr = sp.from || defaultFromStr();
  const toStr = sp.to || defaultToStr();
  const talentId = sp.talentId || undefined;

  const [talents, clicks] = await Promise.all([
    prisma.talent.findMany({
      where: talentScopeWhere(user),
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.linkClick.findMany({
      where: {
        clickedAt: { gte: startOfVnDay(fromStr), lte: endOfVnDay(toStr) },
        link: {
          talent: talentScopeWhere(user) as Prisma.TalentWhereInput,
          ...(talentId ? { talentId } : {}),
        },
      },
      select: {
        clickedAt: true,
        source: true,
        link: {
          select: {
            slug: true,
            talent: { select: { id: true, fullName: true, manager: { select: { fullName: true } } } },
          },
        },
      },
      orderBy: { clickedAt: "desc" },
      take: CLICK_QUERY_LIMIT,
    }),
  ]);

  const truncated = clicks.length === CLICK_QUERY_LIMIT;

  const byTalent = new Map<
    string,
    { talentName: string; mmName: string; slug: string; total: number }
  >();
  const bySource = new Map<string, number>();
  const byDay = new Map<string, number>();

  for (const c of clicks) {
    const clickTalentId = c.link.talent.id;
    const existing = byTalent.get(clickTalentId);
    if (existing) {
      existing.total += 1;
    } else {
      byTalent.set(clickTalentId, {
        talentName: c.link.talent.fullName,
        mmName: c.link.talent.manager.fullName,
        slug: c.link.slug,
        total: 1,
      });
    }

    const source = c.source || "unknown";
    bySource.set(source, (bySource.get(source) ?? 0) + 1);

    const day = vnDateStr(c.clickedAt);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  const talentRows = [...byTalent.values()].sort((a, b) => b.total - a.total);
  const sourceRows = [...bySource.entries()].sort((a, b) => b[1] - a[1]);
  const dayRows = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Aff link Dealverse</h1>
        <p className="text-sm text-muted-foreground">
          Click vào link affiliate Dealverse (`/go/&lt;slug&gt;`) theo Talent, nguồn traffic, và
          thời gian.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="GET">
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="from">
            Từ ngày
          </label>
          <Input id="from" name="from" type="date" defaultValue={fromStr} className="w-40" />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="to">
            Đến ngày
          </label>
          <Input id="to" name="to" type="date" defaultValue={toStr} className="w-40" />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="talentId">
            Talent
          </label>
          <select
            id="talentId"
            name="talentId"
            defaultValue={talentId ?? ""}
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
        <Button type="submit" variant="secondary">
          Lọc
        </Button>
      </form>

      {truncated ? (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
          Đang hiện {CLICK_QUERY_LIMIT.toLocaleString("vi-VN")} click gần nhất trong khoảng đã
          chọn — có thể chưa đủ, thu hẹp khoảng ngày để xem chính xác hơn.
        </p>
      ) : null}

      <p className="text-sm text-muted-foreground">
        Tổng {clicks.length.toLocaleString("vi-VN")} click, {toVnDisplayDate(fromStr)} →{" "}
        {toVnDisplayDate(toStr)}
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Theo Talent</h2>
        <div className="max-w-2xl rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Talent</TableHead>
                <TableHead>MM quản lý</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead className="text-right">Click</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {talentRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                    Chưa có click nào trong khoảng thời gian này
                  </TableCell>
                </TableRow>
              ) : (
                talentRows.map((r) => (
                  <TableRow key={r.slug}>
                    <TableCell>{r.talentName}</TableCell>
                    <TableCell>{r.mmName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">/go/{r.slug}</TableCell>
                    <TableCell className="text-right">{r.total.toLocaleString("vi-VN")}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Theo nguồn</h2>
        <div className="max-w-md rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nguồn</TableHead>
                <TableHead className="text-right">Click</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sourceRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="py-6 text-center text-muted-foreground">
                    Chưa có dữ liệu
                  </TableCell>
                </TableRow>
              ) : (
                sourceRows.map(([source, count]) => (
                  <TableRow key={source}>
                    <TableCell>{source}</TableCell>
                    <TableCell className="text-right">{count.toLocaleString("vi-VN")}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Theo ngày</h2>
        <div className="max-w-md rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ngày</TableHead>
                <TableHead className="text-right">Click</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dayRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="py-6 text-center text-muted-foreground">
                    Chưa có dữ liệu
                  </TableCell>
                </TableRow>
              ) : (
                dayRows.map(([day, count]) => (
                  <TableRow key={day}>
                    <TableCell>{toVnDisplayDate(day)}</TableCell>
                    <TableCell className="text-right">{count.toLocaleString("vi-VN")}</TableCell>
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
