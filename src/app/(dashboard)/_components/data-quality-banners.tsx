import type { ScalefMatchStatus, ProductionCostStatus } from "@/server/dashboard/finance";
import { formatVnd } from "@/lib/labels";

// 2 banner BẮT BUỘC theo docs/MODULE_PROMPTS.md Module 6 — không bao giờ âm thầm hiện số 0 gây
// hiểu nhầm là "không có gì". Tính live mỗi lần render (không lưu thành insight — đây là ngữ cảnh
// luôn bật, không phải sự kiện có vòng đời mở/đóng).
export function DataQualityBanners({
  matchStatus,
  costStatus,
}: {
  matchStatus: ScalefMatchStatus;
  costStatus: ProductionCostStatus;
}) {
  const banners: { key: string; text: string }[] = [];

  if (matchStatus.totalCount > 0 && matchStatus.matchedCount < matchStatus.totalCount) {
    banners.push({
      key: "scalef-match",
      text:
        `ScaleF: mới ghép được ${matchStatus.matchedCount}/${matchStatus.totalCount} video với Talent. ` +
        `Còn ${formatVnd(matchStatus.unattributedReward)} thưởng và ${matchStatus.unattributedViews.toLocaleString("vi-VN")} ` +
        `view THẬT đã tồn tại nhưng CHƯA gắn được vào Talent/campaign nào — số doanh thu ScaleF bên dưới KHÔNG bao gồm phần này. ` +
        `Vào /scalef để ghép tay.`,
    });
  }

  const preCutoffZeroPct = costStatus.preCutoffTotal > 0 ? (costStatus.preCutoffZero / costStatus.preCutoffTotal) * 100 : 0;

  if (costStatus.postCutoffZero > 0) {
    banners.push({
      key: "production-cost-gap",
      text:
        `Có ${costStatus.postCutoffZero}/${costStatus.postCutoffTotal} video air TỪ 2026-07-22 (sau khi đã backfill giá mặc định) ` +
        `vẫn chưa được điền chi phí sản xuất (production_cost=0) — đây là khoảng trống nhập liệu thật, không phải do chưa backfill.`,
    });
  }
  if (preCutoffZeroPct > 50) {
    banners.push({
      key: "production-cost-legacy",
      text:
        `${costStatus.preCutoffZero}/${costStatus.preCutoffTotal} video air TRƯỚC 2026-07-22 chưa có chi phí sản xuất ` +
        `(video cũ, import trước khi backfill giá mặc định — bình thường). Vì phần lớn video trong khoảng đang xem thiếu số này, ` +
        `số LỢI NHUẬN bên dưới chưa đáng tin cậy đầy đủ.`,
    });
  }

  if (banners.length === 0) return null;

  return (
    <div className="space-y-2">
      {banners.map((b) => (
        <p key={b.key} className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          {b.text}
        </p>
      ))}
    </div>
  );
}
