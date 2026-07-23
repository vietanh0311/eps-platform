import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Role } from "@/generated/prisma/enums";
import { SYSTEM_ADMIN_ROLES, isSystemAdmin } from "@/lib/roles";

export type SessionUser = { id: string; role: Role; email: string; name: string };

// Lấy user hiện tại, chưa đăng nhập thì đẩy về /login.
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return {
    id: session.user.id,
    role: session.user.role,
    email: session.user.email ?? "",
    name: session.user.name ?? "",
  };
}

// Chặn theo role — dùng ở đầu MỌI server action / page cần giới hạn quyền.
// Phân quyền thật nằm ở server (proxy chỉ là lớp chặn ngoài).
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/");
  return user;
}

// Team Tech (role DB TECH) và Team Finance (role DB CFO) là hai nhóm quản trị toàn hệ thống,
// quyền ngang nhau — dùng cho MỌI action/trang chỉ dành cho system admin (trước đây hay viết
// nhầm thành requireRole("CFO") một mình).
export async function requireSystemAdmin(): Promise<SessionUser> {
  return requireRole(...SYSTEM_ADMIN_ROLES);
}

// Điều kiện lọc Talent theo role: Team Tech/Team Finance thấy tất cả, MM chỉ thấy Talent mình quản lý.
export function talentScopeWhere(user: SessionUser) {
  return user.role === "MM" ? { managerId: user.id } : {};
}

// MM chỉ được sửa Talent của mình; Team Tech/Team Finance sửa được mọi Talent.
export function canEditTalent(user: SessionUser, talentManagerId: string): boolean {
  if (isSystemAdmin(user.role)) return true;
  if (user.role === "MM") return user.id === talentManagerId;
  return false;
}

// ===== Module 2 — Campaign & Log video =====

// Campaign: Team Tech/Team Finance thấy tất cả. MM thấy campaign mình phụ trách, campaign mà
// Talent của mình có video trong đó (campaign nhập từ log video là cấp nhãn hàng, dùng chung
// nhiều MM), VÀ campaign đồng bộ Ambassador chưa ai nhận (mmId null — phải thấy được mới "Nhận"
// được, xem canClaimCampaign). Xem được không có nghĩa là sửa được: sửa/giao Talent vẫn phải qua
// canEditCampaign.
export function campaignScopeWhere(user: SessionUser) {
  return user.role === "MM"
    ? {
        OR: [
          { mmId: user.id },
          { videos: { some: { talent: { managerId: user.id } } } },
          { mmId: null },
        ],
      }
    : {};
}

// Video: Team Tech/Team Finance thấy tất cả, MM chỉ thấy video của Talent mình quản lý.
export function videoScopeWhere(user: SessionUser) {
  return user.role === "MM" ? { talent: { managerId: user.id } } : {};
}

// Team Tech/Team Finance và MM phụ trách campaign được sửa brief / giao Talent — quyền ngang nhau
// giữa hai nhóm quản trị, MM vẫn giới hạn đúng campaign mình phụ trách.
// campaignMmId null = campaign đồng bộ từ Ambassador chưa ai nhận — chỉ system admin sửa được cho
// tới khi có MM "Nhận" (set mmId), MM khác chưa được sửa dù nhìn thấy nó qua campaignScopeWhere.
export function canEditCampaign(user: SessionUser, campaignMmId: string | null): boolean {
  if (isSystemAdmin(user.role)) return true;
  if (user.role === "MM") return campaignMmId !== null && user.id === campaignMmId;
  return false;
}

// Campaign đồng bộ từ Ambassador chưa ai nhận (mmId null) — MM tự nhận, hoặc system admin nhận
// thay (chọn MM bất kỳ). Campaign đã có mmId thì không "nhận" được nữa, chỉ sửa qua canEditCampaign.
export function canClaimCampaign(user: SessionUser, campaign: { mmId: string | null }): boolean {
  if (campaign.mmId !== null) return false;
  return isSystemAdmin(user.role) || user.role === "MM";
}

// MM log video thay cho Talent mình quản lý (Talent không có tài khoản đăng nhập). Team
// Tech/Team Finance log được cho mọi Talent (quyền ngang nhau).
export function canLogVideoFor(user: SessionUser, talentManagerId: string): boolean {
  if (isSystemAdmin(user.role)) return true;
  if (user.role === "MM") return user.id === talentManagerId;
  return false;
}

// Sửa nội dung video (brief comment, feedback, trạng thái duyệt) — cùng quyền với log video.
export function canReviewVideo(user: SessionUser, talentManagerId: string): boolean {
  return canLogVideoFor(user, talentManagerId);
}

// Pipeline (gồm cả bước cuối "nộp ScaleF") là việc của team Tech, áp dụng cho MỌI video —
// Team Finance có quyền ngang Team Tech nên cũng thao tác được.
export function canEditPipeline(user: SessionUser): boolean {
  return isSystemAdmin(user.role);
}

// MM check xác nhận phần Tech đã nộp lên ScaleF (hoặc system admin, quyền ngang nhau) — chỉ MM
// phụ trách Talent đó.
export function canConfirmScalef(user: SessionUser, talentManagerId: string): boolean {
  if (isSystemAdmin(user.role)) return true;
  if (user.role === "MM") return user.id === talentManagerId;
  return false;
}

// ===== Module 3 — Lương & thưởng =====

// Tạo/duyệt/đánh dấu đã trả kỳ lương + quản lý booking deal + đặt cơ chế Campaign — quyền ngang
// nhau giữa Team Tech và Team Finance (hai nhóm quản trị toàn hệ thống).
export function canManagePayroll(user: SessionUser): boolean {
  return isSystemAdmin(user.role);
}

// PayrollItem: Team Tech/Team Finance thấy tất cả. MM chỉ thấy dòng của chính mình (userId = mình)
// — không thấy dòng của MM khác, không thấy dòng của Talent (kể cả Talent mình quản lý — xem
// riêng qua talentScopeWhere).
export function payrollItemScopeWhere(user: SessionUser) {
  return user.role === "MM" ? { userId: user.id } : {};
}

// PayrollPeriod: Team Tech/Team Finance thấy tất cả kỳ. MM chỉ thấy kỳ có ít nhất 1 item của mình.
export function payrollPeriodScopeWhere(user: SessionUser) {
  return user.role === "MM" ? { items: { some: { userId: user.id } } } : {};
}

// ===== Module 6 — Dashboard, chi phí, insight =====

// Quản lý chi phí (tạo/sửa/xóa) — quyền ngang nhau giữa Team Tech/Team Finance, không phân biệt
// người tạo (đúng triết lý system-admin ngang quyền của requireSystemAdmin), cùng cách
// canManagePayroll chỉ là alias có tên miền nghiệp vụ của isSystemAdmin.
export function canManageExpenses(user: SessionUser): boolean {
  return isSystemAdmin(user.role);
}

// Insight: lọc theo role đang đăng nhập có nằm trong visibleToRoles không.
export function insightRoleWhere(user: SessionUser) {
  return { visibleToRoles: { has: user.role } };
}
