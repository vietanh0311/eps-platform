"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireSystemAdmin } from "@/lib/authz";
import { Role, UserStatus } from "@/generated/prisma/enums";

// Toàn bộ quản lý tài khoản dành cho system admin — Team Tech và Team Finance, quyền ngang nhau.

const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email không hợp lệ"),
  fullName: z.string().trim().min(1, "Thiếu họ tên"),
  role: z.enum(Role),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
});

export async function createUser(formData: FormData) {
  const admin = await requireSystemAdmin();
  const parsed = createUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(
      `/admin/users?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ")}`,
    );
  }
  const d = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: d.email } });
  if (existing) redirect(`/admin/users?error=${encodeURIComponent("Email đã tồn tại")}`);

  const user = await prisma.user.create({
    data: {
      email: d.email,
      fullName: d.fullName,
      role: d.role,
      passwordHash: await hash(d.password, 12),
    },
  });
  await logAudit({
    userId: admin.id,
    action: "CREATE",
    entity: "users",
    entityId: user.id,
    detail: `Tạo tài khoản ${user.email} (${user.role})`,
  });
  revalidatePath("/admin/users");
  redirect("/admin/users?saved=1");
}

export async function setUserStatus(userId: string, status: UserStatus) {
  const admin = await requireSystemAdmin();
  if (userId === admin.id) redirect(`/admin/users?error=${encodeURIComponent("Không thể tự khóa tài khoản của mình")}`);

  const user = await prisma.user.update({ where: { id: userId }, data: { status } });
  await logAudit({
    userId: admin.id,
    action: "UPDATE",
    entity: "users",
    entityId: userId,
    detail: `${status === "DISABLED" ? "Khóa" : "Mở khóa"} tài khoản ${user.email}`,
  });
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

const resetPasswordSchema = z.object({
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
});

export async function resetUserPassword(userId: string, formData: FormData) {
  const admin = await requireSystemAdmin();
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(
      `/admin/users?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Mật khẩu không hợp lệ")}`,
    );
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hash(parsed.data.password, 12) },
  });
  await logAudit({
    userId: admin.id,
    action: "UPDATE",
    entity: "users",
    entityId: userId,
    detail: `Đặt lại mật khẩu cho ${user.email}`,
  });
  revalidatePath("/admin/users");
  redirect("/admin/users?saved=1");
}
