import { prisma } from "@/lib/prisma";
import { requireSystemAdmin } from "@/lib/authz";
import { createUser, resetUserPassword, setUserStatus } from "@/server/actions/users";
import { ROLE_LABELS, USER_STATUS_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const admin = await requireSystemAdmin();
  const { error, saved } = await searchParams;

  const users = await prisma.user.findMany({ orderBy: [{ role: "asc" }, { fullName: "asc" }] });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tài khoản</h1>
        <p className="text-sm text-muted-foreground">
          Chỉ Team Tech / Team Finance truy cập được trang này. Tài khoản bị khóa sẽ không đăng
          nhập được nhưng dữ liệu liên quan vẫn giữ nguyên.
        </p>
      </div>

      {error ? (
        <p className="max-w-xl rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="max-w-xl rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          Đã lưu
        </p>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Họ tên</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Vai trò</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.fullName}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <Badge variant="outline">{ROLE_LABELS[u.role]}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={u.status === "ACTIVE" ? "default" : "destructive"}>
                    {USER_STATUS_LABELS[u.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {u.id === admin.id ? (
                    <span className="text-xs text-muted-foreground">(bạn)</span>
                  ) : (
                    <div className="flex items-center justify-end gap-2">
                      <details className="relative">
                        <summary className="cursor-pointer list-none text-sm text-primary hover:underline">
                          Đặt lại mật khẩu
                        </summary>
                        <form
                          action={resetUserPassword.bind(null, u.id)}
                          className="absolute right-0 z-10 mt-2 flex w-64 items-end gap-2 rounded-md border bg-background p-3 shadow-md"
                        >
                          <div className="grid flex-1 gap-1">
                            <Label htmlFor={`pw-${u.id}`} className="text-xs">
                              Mật khẩu mới
                            </Label>
                            <Input
                              id={`pw-${u.id}`}
                              name="password"
                              type="password"
                              minLength={8}
                              required
                            />
                          </div>
                          <Button type="submit" size="sm">
                            Lưu
                          </Button>
                        </form>
                      </details>
                      <form
                        action={setUserStatus.bind(
                          null,
                          u.id,
                          u.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
                        )}
                      >
                        <Button
                          type="submit"
                          size="sm"
                          variant={u.status === "ACTIVE" ? "destructive" : "secondary"}
                        >
                          {u.status === "ACTIVE" ? "Khóa" : "Mở khóa"}
                        </Button>
                      </form>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Tạo tài khoản mới</CardTitle>
          <CardDescription>
            Dành cho MM, Team Tech và Team Finance. Gửi mật khẩu cho người dùng qua kênh riêng,
            yêu cầu họ đổi sau lần đăng nhập đầu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createUser} className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="fullName">Họ tên</Label>
                <Input id="fullName" name="fullName" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="role">Vai trò</Label>
                <select
                  id="role"
                  name="role"
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  defaultValue="MM"
                >
                  <option value="MM">{ROLE_LABELS.MM}</option>
                  <option value="TECH">{ROLE_LABELS.TECH}</option>
                  <option value="CFO">{ROLE_LABELS.CFO}</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Mật khẩu ban đầu</Label>
                <Input id="password" name="password" type="password" minLength={8} required />
              </div>
            </div>
            <div>
              <Button type="submit">Tạo tài khoản</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
