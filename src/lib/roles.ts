import { Role } from "@/generated/prisma/enums";

// Team Tech (role DB "TECH") và Team Finance (role DB "CFO") là hai nhóm quản trị toàn hệ thống,
// quyền ngang nhau — xem/tạo/sửa/giao việc/quản lý toàn bộ dữ liệu, trừ hành động dành riêng cho
// hệ thống tự động. Giữ nguyên giá trị enum DB (tránh migration rủi ro), chỉ đổi tên hiển thị
// (xem ROLE_LABELS ở lib/labels.ts) và gộp policy về đây thay vì rải role === "CFO" nhiều nơi.
//
// Module không import Prisma client/auth (chỉ import type enum thuần) để dùng được cả trong
// middleware edge runtime (auth.config.ts) lẫn code server thường (authz.ts).
export const SYSTEM_ADMIN_ROLES: Role[] = [Role.CFO, Role.TECH];

export function isSystemAdmin(role: Role | null | undefined): boolean {
  return role === Role.CFO || role === Role.TECH;
}
