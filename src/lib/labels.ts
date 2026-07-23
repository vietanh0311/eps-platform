// Nhãn tiếng Việt cho enum trong DB (enum lưu tiếng Anh, hiển thị tiếng Việt).
export const TALENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Đang hoạt động",
  PAUSED: "Tạm dừng",
  STOPPED: "Đã nghỉ",
};

export const PLATFORM_LABELS: Record<string, string> = {
  TIKTOK: "TikTok",
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
  OTHER: "Khác",
};

// CFO/TECH là giá trị enum DB giữ nguyên để tránh migration rủi ro — tên hiển thị trên toàn hệ
// thống là "Team Finance"/"Team Tech". Hai role này là system admin, quyền ngang nhau
// (xem isSystemAdmin ở lib/roles.ts); MM vẫn là role có scope theo Talent được giao.
export const ROLE_LABELS: Record<string, string> = {
  CFO: "Team Finance",
  MM: "Media Manager",
  TECH: "Team Tech",
  TALENT: "Talent",
};

export const USER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Hoạt động",
  DISABLED: "Đã khóa",
};

export const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  NEW: "Mới nhận",
  RUNNING: "Đang chạy",
  DONE: "Đã kết thúc",
};

export const CAMPAIGN_SOURCE_LABELS: Record<string, string> = {
  AMBASSADOR: "Đồng bộ Ambassador",
  MANUAL: "Nhập tay",
  INTERNAL: "Nội bộ (Aff/Booking...)",
};

export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  ASSIGNED: "Đã giao",
  IN_PROGRESS: "Đang làm",
  DONE: "Hoàn thành",
  CANCELLED: "Đã hủy",
};

export const REVIEW_STATUS_LABELS: Record<string, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  NEEDS_FIX: "Cần sửa",
};

export const PIPELINE_STATUS_LABELS: Record<string, string> = {
  NOT_IN_PIPELINE: "Chưa vào pipeline",
  RECEIVED: "Đã nhận",
  ADS_DONE: "Đã chạy ads",
  ENGAGEMENT_DONE: "Đã chạy tương tác",
  SENT_SCALEF: "Đã gửi ScaleF",
};

// Thứ tự các bước pipeline của team Tech — dùng để dựng nút "chuyển bước tiếp theo".
export const PIPELINE_ORDER = [
  "NOT_IN_PIPELINE",
  "RECEIVED",
  "ADS_DONE",
  "ENGAGEMENT_DONE",
  "SENT_SCALEF",
] as const;

export const PAYROLL_PERIOD_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Nháp",
  APPROVED: "Đã duyệt",
  PAID: "Đã trả",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Chưa trả",
  PAID: "Đã trả",
};

export const SCRAPE_RUN_STATUS_LABELS: Record<string, string> = {
  SUCCESS: "Thành công",
  FAILED: "Lỗi",
};

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  ADS: "Ads",
  PRODUCTION: "Sản xuất",
  SALARY: "Lương",
  OTHER: "Khác",
};

export const INSIGHT_SEVERITY_LABELS: Record<string, string> = {
  INFO: "Thông tin",
  WARNING: "Cảnh báo",
  CRITICAL: "Nghiêm trọng",
};

export const INSIGHT_TYPE_LABELS: Record<string, string> = {
  VIDEO_LATE: "Video chậm tiến độ",
  VIEW_DROP: "View sụt giảm",
  SCRAPER_FAILED: "Đồng bộ ScaleF lỗi",
  TALENT_INACTIVE: "Talent không hoạt động",
  VIEW_ASSUMPTION_MISMATCH: "Lệch view giả định vs thật",
};

export function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(amount) + " đ";
}

export function formatDate(value: Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(value);
}

export function formatDateTime(value: Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

// desc_html của campaign đồng bộ Ambassador là dữ liệu ngoài — KHÔNG BAO GIỜ render trực tiếp
// (dangerouslySetInnerHTML), chèn <script> là chiếm được phiên CFO. Strip toàn bộ tag thành văn
// xuôi thường; brief đầy đủ có định dạng thì mở source_url xem bản gốc.
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
