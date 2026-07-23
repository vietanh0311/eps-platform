# Công thức lương & thưởng MM/Talent (Module 3)

> **Bản công khai cho GitHub.** File gốc đầy đủ — có kèm số liệu tài chính thật đã đối chiếu với
> report Google Sheets (lợi nhuận/hoa hồng thực tế theo từng deal) — nằm ở `data/co-che-luong-thuong-mm.md`
> trên máy CFO, **không commit vào git** (`/data/` bị gitignore vì chứa dữ liệu tài chính/cá nhân
> nhạy cảm). Bản này giữ nguyên công thức + hằng số + chính sách để bất kỳ dev nào cũng đọc hiểu và
> maintain được `src/server/payroll/compute.ts`, chỉ bỏ các ví dụ đối chiếu có số tiền thật.

Nguồn gốc công thức: 3 file Google Sheets thật (cơ chế thưởng, report lương MM Giang, report
lương MM Hà) — xem link trong `docs/PROJECT_EPS.md`. Đã đối chiếu khớp 100% với dữ liệu gốc trước
khi seed vào `reward_policies` (xem `scripts/reconcile-payroll.ts`, `scripts/seed-reward-policies.ts`).

## Công thức MM — nhóm campaign theo KPI views

```
Số views quy đổi   = Số video MM log trong campaign, tháng đó × avgViewsPerVideo (80,000)
Doanh thu thực     = Số views quy đổi × price_per_view
Doanh thu sau thuế = Doanh thu thực × taxRate (90%)
Chi phí trên views = Số views quy đổi × fixed_cost_per_view
Chi phí sản xuất   = SUM(Video.productionCost) của MM đó, trong campaign đó, trong tháng đó
Mức chi phí max    = Doanh thu thực × cost_ceiling_pct
Thưởng tiết kiệm   = savingsRate × (Mức chi phí max − Chi phí sản xuất)   [có thể âm]
Tổng chi phí       = Chi phí trên views + Chi phí sản xuất + Thưởng tiết kiệm
Lợi nhuận ròng      = Doanh thu sau thuế − Tổng chi phí
Com MM              = profitShareRate × Lợi nhuận ròng
Tổng nhận MM/campaign = Com MM + Thưởng tiết kiệm
```

### Rate theo thời gian (versioned, seed `reward_policies` name="campaign_commission", applies_to=MM)
| effective_from | effective_to | savingsRate | profitShareRate |
|---|---|---|---|
| 2025-01-01 | 2025-06-30 | 0.50 | 0.20 |
| 2025-07-01 | (null, hiện tại) | 0.65 | 0.18 |

Ngày đổi chính xác không thấy trong Sheet (khoảng 30/6 → 12/8/2025) — seed `2025-07-01`, sửa lại
nếu CFO nhớ đúng ngày. Đã đối chiếu khớp với nhiều dòng report thật ở cả 2 mốc rate (xem file gốc
trên máy CFO nếu cần xác minh lại).

### avgViewsPerVideo / taxRate
"Số view trung bình/video" = 80,000 lặp lại ở MỌI dòng report đã đọc (Giang lẫn Hà, mọi tháng) —
seed hằng số này trong `params.avgViewsPerVideo`, không đổi theo campaign. Thuế 10% (doanh thu sau
thuế = thực × 90%) cũng cố định ở mọi dòng đã đọc — `params.taxRate = 0.90`.

### costCeilingTiers mặc định (áp dụng khi Campaign.costCeilingPct chưa đặt riêng)
Do CFO cung cấp trực tiếp (không phải số cũ trong Sheet — số % lịch sử là đặt riêng từng campaign,
không theo tier nào): 10-12đ/view → 20%; 13-17đ/view → 15%; >17đ/view → 12%.

## Ví dụ minh họa công thức (số MINH HỌA, không phải số thật)

```
Input: đồng/view=13, KPI views=4,000,000, %chi phí max=18%, chi phí cố định/view=4,
       chi phí sản xuất thực chi=6,000,000
Doanh thu thực      = 13 × 4,000,000            = 52,000,000
Mức chi phí max     = 52,000,000 × 18%          =  9,360,000
Thưởng tiết kiệm    = 65% × (9,360,000−6,000,000) = 2,184,000
Chi phí trên views  = 4 × 4,000,000             = 16,000,000
Chi phí sản xuất    =  6,000,000
Tổng chi phí         = 16,000,000+6,000,000+2,184,000 = 24,184,000
Doanh thu sau thuế  = 52,000,000 × 90%          = 46,800,000
Lợi nhuận ròng        = 46,800,000−24,184,000     = 22,616,000
Com MM               = 18% × 22,616,000          =  4,070,880
Tổng nhận MM         = 4,070,880+2,184,000        =  6,254,880
```

## Booking — chia 4 bên
Mẫu 25% - MM 25% - Công ty 25% - người bán deal 25% — `reward_policies` name="booking_split",
applies_to=MM, params `{ talentShare: 0.25, mmShare: 0.25, companyShare: 0.25, sellerShare: 0.25 }`.
Người bán deal mặc định = MM quản lý, đổi được nếu người khác chốt deal (xem `/booking`).

## Talent — 3 chính sách thưởng (do CFO cung cấp trực tiếp, không phải từ Sheet)
1. `referral_bonus` (applies_to=TALENT): mốc 1 = Talent mới đạt 10 video campaign đầu tiên →
   300,000đ trả cho NGƯỜI GIỚI THIỆU; mốc 2 = Talent đó có >2 tháng thâm niên VÀ đạt 40 video →
   1,200,000đ trả cho người giới thiệu. Trả 1 lần/mốc (không lặp hàng tháng), chi trả ngày 25-28.
2. `top_performer_bonus` (applies_to=TALENT): Top 1/2/3 toàn công ty theo số video campaign/tháng,
   phải đạt CẢ thứ hạng lẫn ngưỡng: hạng 1 (>20 video)=500k, hạng 2 (>15 video)=300k, hạng 3
   (>10 video)=200k. Không đạt ngưỡng thì hạng đó bỏ trống tháng đó, không đẩy hạng dưới lên.
3. `quantity_tier_bonus` (applies_to=TALENT): chọn 1 mốc cao nhất trong tháng, không cộng dồn giữa
   các mốc — 15 video=200k, 20 video=300k, 30 video=500k. Chỉ tính video có `campaignId`. Cộng dồn
   được với `top_performer_bonus` nếu đạt cả hai.

## Vấn đề dữ liệu đã biết
`Talent.productionFeePerVideo` đã được backfill bằng số thật đọc từ report (2026-07-22, xem
`scripts/backfill-production-fees.ts`) — trước đó là 0 cho toàn bộ Talent nên mọi
`Video.productionCost` import trước ngày đó cũng = 0, khiến phần "chi phí sản xuất" trong lương
tính sai. Đã xử lý, nhưng lưu ý nguyên tắc: **chi phí phụ thuộc CAMPAIGN, không phụ thuộc Talent**
(cùng MM + cùng campaign → mọi Talent cùng đơn giá) — số backfill chỉ là mặc định khởi điểm, MM vẫn
phải tự xác nhận/điền số thật theo từng video khi nộp.
