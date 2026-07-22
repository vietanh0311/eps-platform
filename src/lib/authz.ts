import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Role } from "@/generated/prisma/enums";

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

// Điều kiện lọc Talent theo role: CFO/TECH thấy tất cả, MM chỉ thấy Talent mình quản lý.
export function talentScopeWhere(user: SessionUser) {
  return user.role === "MM" ? { managerId: user.id } : {};
}

// MM chỉ được sửa Talent của mình; TECH không được sửa.
export function canEditTalent(user: SessionUser, talentManagerId: string): boolean {
  if (user.role === "CFO") return true;
  if (user.role === "MM") return user.id === talentManagerId;
  return false;
}

// ===== Module 2 — Campaign & Log video =====

// Campaign: CFO/TECH thấy tất cả. MM thấy campaign mình phụ trách VÀ campaign mà Talent của mình
// có video trong đó — vì campaign nhập từ log video là cấp nhãn hàng, dùng chung nhiều MM.
// Xem được không có nghĩa là sửa được: sửa/giao Talent vẫn phải qua canEditCampaign (đúng chủ).
export function campaignScopeWhere(user: SessionUser) {
  return user.role === "MM"
    ? { OR: [{ mmId: user.id }, { videos: { some: { talent: { managerId: user.id } } } }] }
    : {};
}

// Video: CFO/TECH thấy tất cả, MM chỉ thấy video của Talent mình quản lý.
export function videoScopeWhere(user: SessionUser) {
  return user.role === "MM" ? { talent: { managerId: user.id } } : {};
}

// Chỉ CFO và MM phụ trách campaign được sửa brief / giao Talent. TECH chỉ đọc.
// campaignMmId null = campaign đồng bộ từ Ambassador chưa ai nhận — chỉ CFO sửa được cho tới khi
// có MM "Nhận" (set mmId), MM khác chưa được sửa dù nhìn thấy nó qua campaignScopeWhere.
export function canEditCampaign(user: SessionUser, campaignMmId: string | null): boolean {
  if (user.role === "CFO") return true;
  if (user.role === "MM") return campaignMmId !== null && user.id === campaignMmId;
  return false;
}

// MM log video thay cho Talent mình quản lý (Talent không có tài khoản đăng nhập).
export function canLogVideoFor(user: SessionUser, talentManagerId: string): boolean {
  if (user.role === "CFO") return true;
  if (user.role === "MM") return user.id === talentManagerId;
  return false;
}

// Sửa nội dung video (brief comment, feedback, trạng thái duyệt) — cùng quyền với log video.
export function canReviewVideo(user: SessionUser, talentManagerId: string): boolean {
  return canLogVideoFor(user, talentManagerId);
}

// Pipeline (gồm cả bước cuối "nộp ScaleF") là việc của team Tech, áp dụng cho MỌI video.
export function canEditPipeline(user: SessionUser): boolean {
  return user.role === "TECH" || user.role === "CFO";
}

// MM check xác nhận phần Tech đã nộp lên ScaleF — chỉ MM phụ trách Talent đó (hoặc CFO).
export function canConfirmScalef(user: SessionUser, talentManagerId: string): boolean {
  if (user.role === "CFO") return true;
  if (user.role === "MM") return user.id === talentManagerId;
  return false;
}

// ===== Module 3 — Lương & thưởng =====

// Chỉ CFO tạo/duyệt/đánh dấu đã trả kỳ lương + quản lý booking deal + đặt cơ chế Campaign.
export function canManagePayroll(user: SessionUser): boolean {
  return user.role === "CFO";
}

// PayrollItem: CFO thấy tất cả. MM chỉ thấy dòng của chính mình (userId = mình) — không thấy dòng
// của MM khác, không thấy dòng của Talent (kể cả Talent mình quản lý — xem riêng qua talentScopeWhere).
export function payrollItemScopeWhere(user: SessionUser) {
  return user.role === "MM" ? { userId: user.id } : {};
}

// PayrollPeriod: CFO thấy tất cả kỳ. MM chỉ thấy kỳ có ít nhất 1 item của mình.
export function payrollPeriodScopeWhere(user: SessionUser) {
  return user.role === "MM" ? { items: { some: { userId: user.id } } } : {};
}
