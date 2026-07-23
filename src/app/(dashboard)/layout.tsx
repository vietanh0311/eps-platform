import Link from "next/link";
import { requireUser } from "@/lib/authz";
import { isSystemAdmin } from "@/lib/roles";
import { logoutAction } from "@/server/actions/session";
import { ROLE_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Role } from "@/generated/prisma/enums";

// Menu điều hướng — Team Tech và Team Finance (system admin) thấy quyền ngang nhau; các module
// sau sẽ thêm mục tại đây kèm điều kiện role.
function navItems(role: Role) {
  const items = [
    { href: "/", label: "Tổng quan" },
    { href: "/talents", label: "Talent" },
    { href: "/campaigns", label: "Campaign" },
    { href: "/videos", label: "Log video" },
  ];
  if (isSystemAdmin(role) || role === "MM") {
    items.push({ href: "/payroll", label: "Lương & thưởng" });
    items.push({ href: "/booking", label: "Booking" });
    items.push({ href: "/affiliate", label: "Aff link Dealverse" });
  }
  if (isSystemAdmin(role)) {
    items.push({ href: "/scalef", label: "Đồng bộ ScaleF" });
    items.push({ href: "/admin/users", label: "Tài khoản" });
  }
  return items;
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-muted/30 p-4">
        <div className="mb-6">
          <p className="text-lg font-semibold">EPS Platform</p>
          <p className="text-xs text-muted-foreground">Vận hành nội bộ</p>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems(user.role).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          <Separator className="my-3" />
          <p className="truncate text-sm font-medium">{user.name}</p>
          <Badge variant="secondary" className="mt-1">
            {ROLE_LABELS[user.role] ?? user.role}
          </Badge>
          <form action={logoutAction} className="mt-3">
            <Button variant="outline" size="sm" className="w-full" type="submit">
              Đăng xuất
            </Button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
