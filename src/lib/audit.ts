import { prisma } from "@/lib/prisma";

// Ghi vết mọi thao tác tạo/sửa/xóa — yêu cầu bảo mật của dự án (docs/DB_SCHEMA.md nhóm 8).
export async function logAudit(params: {
  userId: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN";
  entity: string;
  entityId: string;
  detail?: string;
}) {
  await prisma.auditLog.create({ data: params });
}
