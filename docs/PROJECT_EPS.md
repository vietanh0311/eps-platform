# Escape Poverty Studio (EPS) — Internal Operations Platform

> **Bản sao cho GitHub.** CFO chỉnh sửa/duyệt tài liệu này qua Claude Code ở bản gốc
> (`~/Claude/docs/PROJECT_EPS.md`, ngoài repo git). Bản trong `eps-platform/docs/` được đồng bộ
> lại mỗi khi có cập nhật lớn, để bất kỳ ai clone repo từ GitHub cũng có đủ ngữ cảnh nghiệp vụ —
> không cần quyền truy cập máy CFO. Nếu thấy bản này cũ hơn thực tế, hỏi CFO bản mới nhất.

## Vai trò người dùng chính
CFO/COO — chịu trách nhiệm doanh thu, chính sách thưởng, thúc đẩy tăng trưởng.
Là người trực tiếp làm việc với Claude Code trong dự án này (tự deploy, không có team dev riêng).

## Bối cảnh nghiệp vụ
EPS sản xuất video theo mô hình Manager quản lý Talent, phục vụ booking
brand/KOC qua nền tảng Ambassador (https://ambassador.koc.com.vn/chien-dich, scalef.com).

Quy trình vận hành:
Talent sản xuất video (100–200k/video)
→ Media Manager (MM) nhận brief campaign, giao việc, feedback, đăng social
→ Team công nghệ chạy ads/tăng tương tác
→ Đẩy video lên hệ thống ScaleF để tính thưởng.

## Mục tiêu dự án
Xây website quản lý vận hành nội bộ, thay thế hoàn toàn Google Sheets hiện tại.

## Các module chính
1. Quản lý hồ sơ Talent — thông tin, kênh, định hướng, trạng thái
2. Quản lý Campaign/Brief — MM nhận brief, giao Talent, theo dõi tiến độ
3. Log video hàng ngày — **MM nộp link video vào hệ thống này thay cho Talent** (Talent
   không có tài khoản): chọn Talent mình quản lý, dán link, kèm brief comment, feedback,
   trạng thái duyệt. Tách riêng: tick "đã gửi lên ScaleF" (ghi nhận MM nào gửi, lúc nào)
4. Module Team công nghệ (video pipeline tracking):
   - Trạng thái: Đã nhận → Đã chạy ads → Đã chạy tương tác → Đã gửi ScaleF
   - Đồng bộ dữ liệu ScaleF bằng SCRAPING (không có API chính thức) —
     dùng account do CFO cung cấp, lấy: video đã duyệt, view hàng ngày,
     thưởng theo view/post
   - Lưu ý: cần xử lý session/cookie login, chạy định kỳ (cron),
     tách thành module riêng để dễ bảo trì khi ScaleF đổi giao diện
5. Module Dealverse (affiliate link theo Talent):
   - Nền tảng: dealverse.pages.dev
   - Mỗi Talent mới → tự động generate link riêng (dự kiến dùng tracking
     param/slug + redirect nội bộ để đo click, nguồn traffic, chuyển đổi)
   - Talent gắn link lên bio kênh social, CFO theo dõi performance dẫn về
6. Tính lương & thưởng tự động theo cơ chế hiện có của MM, mở rộng cho
   creator dựa trên dữ liệu scrape ScaleF
7. Dashboard thông minh + insight tự động theo vai trò:
   - CFO/COO: doanh thu, chi phí, lợi nhuận, tăng trưởng, cảnh báo bất thường
   - MM: hiệu suất team, video chậm tiến độ
   - Team công nghệ: trạng thái pipeline, log scraping ScaleF
8. Phân quyền theo vai trò: CFO/COO, MM, Talent, Team công nghệ

## Nguồn dữ liệu cần migrate/tích hợp
- File hồ sơ Talent + Brief campaign + Log video air (Google Sheets hiện tại)
- File cơ chế thưởng & lợi nhuận MM
- File tính lương hàng tháng theo MM
- Scraping ScaleF (account do CFO cung cấp)
- Dealverse (dealverse.pages.dev)

## Nguyên tắc làm việc trong dự án này
- Trước khi code module mới: dùng Plan Mode, trình bày kế hoạch, chờ CFO duyệt
- Chia nhỏ theo module, làm tuần tự (không code toàn bộ 1 lần)
- Sau mỗi phần, giải thích ngắn gọn logic (CFO không chuyên sâu code,
  cần hiểu để maintain lâu dài)
- Ưu tiên bảo mật: account/API ScaleF, phân quyền dữ liệu theo role
- Thứ tự triển khai module:
  Tech stack + schema → Talent/phân quyền → Campaign/Log video →
  Lương/thưởng MM → Scraper ScaleF → Dealverse link → Dashboard/insight

## Tech stack
Đã chốt ngày 2026-07-21 (Phương án A):

- **Framework web**: Next.js (App Router) + TypeScript — một codebase cho cả giao diện lẫn API
- **Database**: PostgreSQL
- **ORM**: Prisma — schema khai báo dễ đọc, tự sinh migration
- **Đăng nhập & phân quyền**: Auth.js (NextAuth), role lưu trong DB (CFO/COO, MM, Talent, Tech), middleware chặn theo role
- **Giao diện**: Tailwind CSS + shadcn/ui
- **Biểu đồ**: Recharts
- **Scraper ScaleF**: Playwright, chạy trong worker/container riêng (cùng repo), lịch chạy bằng cron, giữ session qua storage state. Tách riêng để ScaleF đổi giao diện chỉ sửa module này.
- **Insight tự động**: giai đoạn 1 rule-based (ngưỡng cảnh báo bằng SQL); giai đoạn 2 tùy chọn gọi Claude API sinh nhận xét ngôn ngữ tự nhiên
- **Deploy**: 1 VPS + Docker Compose, quản lý bằng Coolify (HTTPS tự động, xem log, backup Postgres định kỳ đẩy lên object storage)
- **Migrate Google Sheets**: script import một lần từ CSV export, đối chiếu số liệu trước khi bỏ Sheets

Lý do không dùng Vercel: scraper Playwright chạy định kỳ + giữ session login không phù hợp serverless; gom web + DB + scraper về 1 VPS để một nơi quản lý, chi phí cố định.

Rủi ro đã chấp nhận:
1. Scraper ScaleF là điểm mong manh nhất — ScaleF đổi giao diện là gãy; giảm thiểu bằng cô lập module + log lỗi hiển thị trên dashboard Tech.
2. Credentials ScaleF lưu biến môi trường trên VPS, session cookie mã hóa, chỉ role Tech/CFO thấy log scraper.
3. Backup Postgres tự động hàng ngày là bắt buộc trước khi bỏ hẳn Google Sheets.

## Trạng thái hiện tại
- 2026-07-21: Chốt tech stack (Phương án A ở trên). Database schema tổng thể đã được CFO duyệt — lưu tại `docs/DB_SCHEMA.md`.
- 2026-07-22: **Hoàn thành Module 1** (code tại `eps-platform/`, hướng dẫn chạy trong `eps-platform/README.md`):
  - Khung project Next.js 16 + Prisma 7 + PostgreSQL (dev local qua Homebrew, `docker-compose.yml` sẵn cho VPS/Coolify).
  - Bảng: users, talents, talent_channels, audit_logs. Seed tài khoản CFO + MM Giang/Hà + Tech (mật khẩu tạm in console khi seed — cần đổi).
  - Đăng nhập email/mật khẩu, phân quyền 2 lớp (proxy route + check trong từng server action). Đã kiểm chứng trên browser: MM chỉ thấy Talent mình quản lý, bị chặn URL /admin; Tech chỉ đọc; tài khoản khóa không đăng nhập được; audit_logs ghi nhận thao tác.
  - Đã chốt trong module này: Talent chưa cần tài khoản đăng nhập (bật sau); MM chỉ thấy Talent mình quản lý.
- **Import dữ liệu thật (2026-07-22)**: đã import từ file `eps-platform/data/Hồ sơ Talent.xlsx` (sheet "Quản lý kênh + mẫu"):
  - **20 Talent, 31 kênh, 4 MM** (Giang 9, Đức 6, Hà 3, Nga 2). Tự tạo thêm tài khoản MM Đức & Nga khi import.
  - Bổ sung 3 trường vào hồ sơ Talent: `scalef_username`, `scalef_hashtag` (định danh KOC trên ScaleF — khóa cho Module 5), `tax_code` (MST — cho Module 6). Import gom nhiều kênh cùng 1 KOC theo hashtag.
  - Script: `npm run db:import-talents "data/Hồ sơ Talent.xlsx"` (xem trước) / thêm `--write` (ghi thật); đọc thẳng xlsx bằng SheetJS.
  - **Cần CFO xử lý**: 3 hashtag ScaleF bị trùng giữa 2 người khác nhau (`#m2kkthm`, `#rqyd1vy`, `#pj1dnf6`) — nhiều khả năng lỗi nhập liệu, cần sửa trên ScaleF để Module 5 không gắn nhầm thưởng. ~8 Talent chưa có tên thật (đang dùng @handle TikTok), CFO điền dần trong app.
- **File `Hồ sơ Talent.xlsx` chứa sẵn dữ liệu cho các module sau**: các sheet "Quản lý air clip tháng ..." = log video (Module 3, ~900–2000 dòng/tháng); "Brief new"/"Sheet Order"/"Brief Tổng" = brief campaign (Module 2); "Report"/"Dashboard" = lương/thưởng MM (Module 6). Sẽ tái sử dụng khi làm từng module.
- **Phát hiện quan trọng (2026-07-22)**: máy đã có sẵn API client ScaleF hoạt động được từ phiên làm việc trước (package `accesstrade_scalef` — gọi `conversion-api.scalef.com` với token + giải mã AES kiểu Laravel, kèm dashboard `scalef-dashboard/`). Module 5 (đồng bộ ScaleF) sẽ **ưu tiên dùng API này thay vì scraping**; Playwright chỉ là phương án dự phòng nếu API không có dữ liệu video/view/thưởng KOC. Cần xác minh phạm vi dữ liệu API khi vào module 5.
- **Module 2 — Campaign/Brief + Log video: HOÀN THÀNH (2026-07-22)**, code + dữ liệu thật:
  - Bảng campaigns/campaign_assignments/videos/video_pipeline_events. UI: CFO/MM tạo campaign +
    giao Talent (`/campaigns`); MM log video hàng loạt — mỗi dòng 1 link, dùng chung
    Talent/campaign/ngày (`/videos/new`); Tech cập nhật pipeline (Đã nhận → ads → tương tác) kèm
    lịch sử ai-làm-lúc-nào.
  - **Quyết định đổi so với thiết kế ban đầu: Tech là người nộp video lên ScaleF** (không phải
    MM), MM chỉ **xác nhận lại** (đối soát) — 2 cặp cột `scalef_submitted_*`/`scalef_confirmed_*`
    tách riêng, chặn xác nhận khi chưa nộp. Đã cập nhật `docs/DB_SCHEMA.md` nhóm 4.
  - **Import log video 7 tháng 2026 (01→07)** từ `eps-platform/data/Hồ sơ Talent.xlsx`: **315
    video, 14 campaign** (tự tạo từ cột "Campaign" trong sheet — Katinat, Highland, FPTShop,
    HDBank, VPBank, Tiki, Nuti, Lusso, Soundcore, Phở Cung Đình, Vnshop, Techcombank, Aristino,
    Booking). Script `npm run db:import-videos -- --months=2026-01..2026-07` (xem trước) / thêm
    `--write` (ghi thật), idempotent. Khớp Talent 315/317 dòng thật (99.4%) qua 3 bước (handle
    link → tên kênh → tên cột Talent); 2 dòng bỏ qua vì thiếu ngày air trong sheet gốc. 5 tháng
    2025 (08→12) chưa import, chạy được ngay khi cần bằng cách đổi `--months`.
  - **⚠ Xung đột với thiết kế Ambassador (mục dưới):** 14 campaign trên tạo bằng cách khớp tên tag
    — đúng cách mà phân tích 983-vs-27 ở mục Ambassador bên dưới chứng minh không đáng tin (1 tag
    có thể gộp nhiều campaign thật khác đợt). Import này chạy TRƯỚC khi có phân tích đó. Đã báo
    CFO, **CFO chọn giữ nguyên** — không dùng `legacy_campaign_label`, chấp nhận 14 campaign này
    là nhóm thô theo tên brand (đánh dấu `source = MANUAL` để phân biệt campaign đồng bộ thật sau
    này). Chi tiết + lý do đầy đủ: `docs/DB_SCHEMA.md` nhóm 3, mục "Dữ liệu lịch sử".
  - **Sự cố kỹ thuật đã xử lý trong lúc làm:** `prisma/schema.prisma` bị 2 phiên Claude Code sửa
    đồng thời (phiên này code Module 2, phiên khác thiết kế đồng bộ Ambassador) — DB đã migrate
    theo bản có sẵn cho Ambassador (enum `CampaignSource` đổi `SCALEF/OTHER` → `MANUAL/INTERNAL`,
    `campaigns.mm_id` thành nullable, thêm bảng `sync_runs`), code Module 2 đã cập nhật khớp theo.
    CFO đã xác nhận hướng giữ lại bản sẵn sàng cho Ambassador.
  - **Verify xong trên browser cả 3 role**: MM Giang (chỉ Talent/campaign/video của mình, log
    nhiều video 1 lần, bị chặn `/admin`), Tech (chỉ pipeline + nộp ScaleF, không sửa brief/duyệt),
    CFO (toàn quyền, xác nhận ScaleF thay MM được). Trường hợp biên đã test: MM không sở hữu
    campaign nhưng có Talent video trong đó → thấy được, không sửa được (đúng thiết kế).
    `npm run build` sạch.
- **2026-07-22 — Bổ sung: đồng bộ Campaign từ Ambassador (thiết kế xong, chưa code).** CFO muốn campaign trên `ambassador.koc.com.vn/chien-dich` tự động lấy về cho MM chọn, cùng danh sách với campaign tạo tay. Đã khảo sát và chốt thiết kế (chi tiết đầy đủ trong `docs/DB_SCHEMA.md` nhóm 3):
  - **Không cần scraper** — có API JSON public, không đăng nhập: `GET https://ambassador.koc.com.vn/api/public/news?type=home_list` (27 campaign đang chạy) + `/api/public/partners` (17 brand).
  - Gộp thẳng vào bảng `campaigns` hiện có (khóa `external_key`), KHÔNG tách bảng riêng, KHÔNG có cơ chế "adopt/nhận", KHÔNG có bảng brands/alias — quy mô 4 MM + 1 CFO không cần các cơ chế đó (đã cân nhắc và loại bỏ chủ động, xem DB_SCHEMA.md để biết lý do).
  - Đổi `mm_id` từ bắt buộc sang tùy chọn (campaign đồng bộ về chưa có MM); đổi enum `source` (`SCALEF`→`MANUAL`, `OTHER`→`INTERNAL`).
  - Dữ liệu lịch sử (log video cũ): không cố khớp tự động campaign — đã kiểm chứng bằng số liệu thật là khớp mờ sẽ sai (ví dụ Highland/FPTShop/Aristino khớp "chắc chắn" 1:1 nhưng vẫn sai). Chỉ lưu nguyên văn tên MM gõ (`legacy_campaign_label`), để trống `campaign_id`.
  - **Việc CFO nên làm** (không chặn code): gửi 1 email cho đầu mối Ambassador/Accesstrade báo đang đọc endpoint public để đồng bộ nội bộ — rủi ro lớn nhất là quan hệ đối tác, không phải kỹ thuật.
  - Prompt sẵn để code phần này: `docs/MODULE_PROMPTS.md` mục "Bổ sung Module 2 — Đồng bộ Campaign từ Ambassador".
- **Module 3 — Lương & thưởng: HOÀN THÀNH (2026-07-22).** Công thức lấy từ 3 file Sheets thật
  (không có bản export trong `data/` — đọc trực tiếp qua Google Drive, đã lưu bản trích công thức +
  số liệu đã xác minh tại `eps-platform/data/co-che-luong-thuong-mm.md`), xác nhận lại với CFO qua
  Plan Mode trước khi code (2 vòng hỏi — công thức MM, sau đó CFO bổ sung thêm chính sách thưởng
  Talent chưa có trong yêu cầu gốc).
  - **Công thức MM (nhóm campaign theo KPI views)**: Doanh thu = (video log × 80.000 view/video mặc
    định) × đồng/view; trừ thuế 10%, trừ chi phí trên views (chi phí cố định/view × views), trừ
    `Video.productionCost` thật, trừ/cộng thưởng tiết kiệm (chênh giữa mức chi phí max và chi phí
    thực chi) → Lợi nhuận ròng → Com MM = %ăn chia × lợi nhuận. Đã verify khớp tuyệt đối với nhiều
    dòng số thật của cả 2 MM (Giang, Hà) trên nhiều tháng. `savingsRate`/`profitShareRate` đổi từ
    50%/20% (≤6/2025) sang 65%/18% (từ ~7/2025, ngày chính xác CFO xác nhận lại sau) — lưu versioned
    trong `reward_policies`.
  - **`Campaign` +3 cột mới** (`pricePerView`, `fixedCostPerView`, `costCeilingPct`, CFO đặt khi
    biết deal, nullable — thiếu thì campaign đó bị bỏ qua khi tính nháp, có cảnh báo, không tính
    bừa). `%chi phí max` mặc định theo tier (10-12đ→20%, 13-17đ→15%, >17đ→12%) khi Campaign chưa đặt
    riêng.
  - **Booking (bảng `BookingDeal` mới, ngoài 3 bảng gốc nhóm 6)**: chia 4 bên mẫu 25%-MM 25%-công
    ty 25%-người bán deal 25% (CFO xác nhận — khác 3 bên 25/50/25 thấy trong dữ liệu lịch sử, có
    thể do MM cũ kiêm cả người bán).
  - **Bổ sung giữa chừng — chính sách thưởng Talent** (CFO cung cấp trực tiếp, không phải từ
    Sheets, dùng đúng `reward_policies.applies_to=TALENT` + `payroll_items.talent_id` đã thiết kế
    sẵn nhưng trước đó tưởng nhầm là "chờ Module 5"): thưởng tuyển dụng (giới thiệu Talent mới đạt
    10/40 video — trả cho **người giới thiệu**, cần cột mới `Talent.referredById`), thưởng Top 1/2/3
    công ty theo video/tháng (phải đạt cả hạng lẫn ngưỡng), thưởng cố định theo mốc số lượng video
    (15/20/30, không cộng dồn giữa mốc, cộng dồn được với thưởng Top).
  - **Đối chiếu với report thật** (`scripts/reconcile-payroll.ts`, `npm run payroll:reconcile`):
    Giang tháng 6/2026 — video count khớp tuyệt đối 5/5 campaign; khi thay chi phí sản xuất = số
    report gốc (cô lập công thức), 4/5 campaign khớp 0.0%, 1 campaign (Highland) lệch 9.5% do chính
    dòng đó trong Sheet gốc mâu thuẫn nội tại (cột "%" ghi 15% nhưng số tiền thực tế tương ứng 13%)
    — không phải lỗi hệ thống. Tổng lệch cô lập chỉ 0.7%. Hà tháng 3/2026 lệch nhiều hơn (~9.4%) do
    2 campaign có số video import lệch nhẹ so với report — khớp đúng cảnh báo đã ghi ở nhóm 3 (import
    campaign "MANUAL" theo tên brand thô, không phải khớp từng đợt chính xác).
  - **Phát hiện quan trọng, ngoài phạm vi module này**: `Talent.productionFeePerVideo` = 0 cho
    TOÀN BỘ 20 Talent (chưa import từ Excel thật ở Module 1) → mọi `Video.productionCost` đã import
    cũng = 0 → đây là nguồn lệch chính khi đối chiếu KHÔNG cô lập công thức (68-119% tuỳ campaign).
    Đã tạo task riêng backfill, không tự sửa trong module này.
  - **Phân quyền**: chỉ CFO tạo/duyệt/trả kỳ lương + quản lý booking deal + đặt cơ chế Campaign
    (thêm `canManagePayroll`, `payrollItemScopeWhere`, `payrollPeriodScopeWhere` vào `authz.ts`, đúng
    pattern `*ScopeWhere` đã có). MM chỉ xem lương của chính mình (breakdown chi tiết để tự đối
    chiếu) — verify trên browser: MM Giang xem đúng kỳ của mình, MM Hà bị chặn (404) khi vào thẳng
    URL kỳ lương của Giang. TECH không có quyền gì trong module này.
  - **Verify xong trên browser**: CFO tạo kỳ lương tháng 6/2026 thật (5 campaign của Giang), số
    khớp đúng script đối chiếu, chạy đủ luồng Nháp → Duyệt → Đã trả. Kỳ này để lại trong DB như bản
    demo thật — cơ chế 5 campaign (VPBank/Highland/FPTShop/HDBank/Tiki) hiện đang mang giá trị của
    tháng 6/2026, CFO nên cập nhật lại nếu tạo kỳ lương tháng khác cho các campaign này (cơ chế lưu
    theo Campaign hiện tại, chưa versioned theo tháng — xem quyết định thiết kế bên dưới).
  - `npm run build` sạch.

- **Module 4 — Đồng bộ ScaleF: HOÀN THÀNH + đã chạy thật với tài khoản dịch vụ (2026-07-22).**
  - **`accesstrade_scalef`/`scalef-dashboard` (phát hiện ở Module 1) SAI sản phẩm** — đọc trực tiếp
    `scalef_client.py`/`daily_digest.py`: gọi API mạng lưới affiliate chung
    (`conversion-api.scalef.com`/`api.scalef.vn`), chỉ có click/conversion/hoa hồng publisher,
    không có video/hashtag/view. Không dùng cho module này. ⚠ `scalef-dashboard/README.md` +
    `.dev.vars.example` có in thẳng 1 token thật — đã báo CFO xoay token, không dùng token đó cho
    bất kỳ việc gì.
  - **API đúng: `ambassador.koc.com.vn/api/admin`** (cùng host API public campaign ở Module 2, khác
    namespace) — đọc bundle JS tĩnh (public, không cần đăng nhập) tìm được route thật
    (`/staffs/login`, `/contents`, `/events`, `/reconciliations`...), sau đó verify response JSON
    **thật** qua phiên trình duyệt cá nhân CFO đang mở (chỉ đọc, không đăng nhập giúp, không lưu
    token đó). Xác nhận: 1 endpoint `GET /contents` đủ cho cả 3 thứ cần — `statistic.view.total`
    (view), `statistic.cash.total` (thưởng, có breakdown waiting/pending/rejected/completed/
    cashback/transfer), trạng thái duyệt. Không cần `/reconciliations` (đối soát lô thanh toán nội
    bộ ScaleF, không phải nguồn dữ liệu chính).
  - **Schema mới** (`prisma/schema.prisma`, nhóm 5 đúng `docs/DB_SCHEMA.md` + 1 bảng ngoài dự
    kiến): `ScalefVideo` (`scalefKey` unique, `videoId` nullable, **+ `title`** — cột thêm ngoài
    DB_SCHEMA.md để màn ghép tay tính lại hashtag/xung đột không cần gọi lại API), `ScalefDailyStat`
    (snapshot insert-only theo ngày), `ScrapeRun` (log mỗi lần chạy), và **`ScalefEvent`** (bảng mới
    theo yêu cầu bổ sung của CFO — chỉ thu thập sẵn `/events` cho module auto-brief campaign sau
    này, Module 4 không xử lý gì thêm).
  - **`src/server/scalef/client.ts` + `sync.ts`**: login cache token trong bộ nhớ, validate mọi
    response bằng zod (envelope sai/code≠1 → dừng, không ghi dòng nào). Khớp Talent qua
    `talents.scalefHashtag` trích từ hashtag trong `title` (regex `#\w+`) — **tự phát hiện hashtag
    trùng bằng query** (không hardcode 3 hashtag CFO nêu lúc import Module 1:
    `#m2kkthm`/`#rqyd1vy`/`#pj1dnf6`), chỉ tự gán `videoId` khi thu hẹp được đúng 1 Talent VÀ đúng 1
    video ứng viên (đã nộp ScaleF, chưa được `ScalefVideo` khác nhận) — mọi trường hợp khác để trống
    cho màn ghép tay, sync không bao giờ ghi đè `videoId` đã ghép tay ở lần chạy sau. Chống chạy
    chồng bằng `pg_try_advisory_lock`. Kích hoạt: `npm run scalef:sync`
    (`scripts/sync-scalef.ts`) + nút "Đồng bộ ngay" (server action, `/scalef`).
  - **Verify xong bằng tài khoản dịch vụ thật (2026-07-22) — vài field/giả định trong bản code đầu
    SAI, đã sửa ngay sau khi có dữ liệu thật:**
    - `.env` CFO điền `SCALEF_ADMIN_BASE_URL` trỏ nhầm domain (`ambassador.scalef.com/content` —
      HTTP 405). Đã tự dò bằng `curl` trực tiếp và xác nhận domain đúng vẫn là
      `ambassador.koc.com.vn/api/admin` (login thật trả HTTP 200) — sửa lại `.env`.
    - Field access-token thật là `data.token` (không phải `accessToken`/`access-token` như đoán ban
      đầu) — bỏ hẳn danh sách field-name-ưu-tiên, dùng thẳng tên đã xác nhận.
    - `/contents` field `link`, `status`, `source`, `event`, `publishedAt` đã xác nhận đúng tên như
      đoán. **Bug phát hiện lúc verify**: giá trị `status` thật là `waiting_approved | approved |
      rejected` — bản code đầu dùng regex `/approved/i` nên nhận nhầm `waiting_approved` (chứa
      substring "approved") thành đã duyệt. Sửa thành so sánh chuỗi chính xác `status === "approved"`.
    - **Phát hiện quan trọng làm đổi thiết kế**: `GET /contents` là danh sách **TOÀN MẠNG LƯỚI
      ScaleF** — xác nhận thật `data.total = 44.312` content (không riêng EPS). Bản code đầu định
      paginate toàn bộ (tới 20.000 dòng) — đổi hẳn sang gọi `keyword=<hashtag>` riêng cho từng
      hashtag Talent đang active (server search substring trong `title`, đã verify khớp đúng 1
      creator/lần trên dữ liệu thật) — vừa đúng phạm vi EPS, vừa nhanh hơn nhiều lần.
  - **Kết quả lần sync thật đầu tiên**: 145 content khớp hashtag của 14 Talent active có
    `scalef_hashtag` (17 Talent có hashtag, 3 trong đó là cặp trùng đã biết). Phân loại tự động:
    **22 content bị chặn đúng thiết kế** (hashtag trùng 2 Talent — đúng cả 3 cặp CFO đã báo từ
    Module 1: `#m2kkthm`, `#rqyd1vy`, `#pj1dnf6`), **98 content khớp đúng 1 Talent nhưng còn nhiều
    video ứng viên** (Talent nộp hàng chục video/tháng nên hashtag một mình không đủ chỉ đúng 1
    video — để trống, chờ ghép tay, đúng chủ đích thiết kế: thà hỏi tay còn hơn gán sai thưởng), 25
    content không nhận diện được hashtag nào. **0/145 tự gán được `video_id`** — không phải lỗi,
    mà là hệ quả thực tế của quy mô dữ liệu (đa số Talent có 10-60 video/tháng đã nộp ScaleF cùng
    hashtag) khớp đúng nguyên tắc "chỉ tự gán khi còn đúng 1 ứng viên" đã chốt khi thiết kế — màn
    ghép tay `/scalef` mới là luồng chính trong thực tế, không phải trường hợp hiếm.
  - **Bug UI phát hiện lúc xem dữ liệu thật, đã sửa**: bảng ghép tay tràn chữ đè lên cột kế bên với
    title dài (table không giới hạn cột theo mặc định) — thêm `table-fixed` + `truncate` (title đủ
    xem qua `title` attribute khi hover, hoặc mở link gốc).
  - **`src/server/scalef/client.ts` + `sync.ts`**: login cache token trong bộ nhớ, validate mọi
    response bằng zod (envelope sai/code≠1 → dừng, không ghi dòng nào). Khớp Talent qua
    `talents.scalefHashtag` trích từ hashtag trong `title` (regex `#\w+`) — **tự phát hiện hashtag
    trùng bằng query** (không hardcode 3 hashtag CFO nêu lúc import Module 1), chỉ tự gán `videoId`
    khi thu hẹp được đúng 1 Talent VÀ đúng 1 video ứng viên (đã nộp ScaleF, chưa được `ScalefVideo`
    khác nhận) — mọi trường hợp khác để trống cho màn ghép tay, sync không bao giờ ghi đè `videoId`
    đã ghép tay ở lần chạy sau. Chống chạy chồng bằng `pg_try_advisory_lock`. Kích hoạt:
    `npm run scalef:sync` (`scripts/sync-scalef.ts`) + nút "Đồng bộ ngay" (server action, `/scalef`).
  - **Màn Tech `/scalef`** (quyền `canEditPipeline` có sẵn — TECH + CFO): log lần chạy + bảng ghép
    tay mọi `scalef_videos.videoId = null`, hiện cảnh báo rõ khi hashtag trùng nhiều Talent (liệt kê
    tên + MM quản lý), chọn tay qua dropdown khi khớp đúng 1 Talent nhưng nhiều video ứng viên —
    verify xong trên browser với 145 dòng dữ liệu thật (role TECH).
  - **`scripts/compare-avg-views.ts`** (`npm run scalef:compare-views`, CHỈ ĐỌC — không ghi
    `reward_policies`, không đụng payroll): theo tháng/Talent, so `avgViewsPerVideo` (đọc từ
    `reward_policies` hiệu lực tại tháng đó, fallback 80.000 nếu chưa có) × số video đã nộp+khớp so
    với tổng view thật mới nhất trong `scalef_daily_stats`. Chưa có số so sánh thật (0 video đã
    khớp `video_id`) — cần Tech ghép tay ở `/scalef` trước, script đã tự báo đúng thông điệp này
    thay vì in bảng rỗng gây hiểu lầm.
  - **Launchd job free trên máy CFO** (cùng pattern `vcd-sync` đang chạy cho `vcd-clean`):
    `scripts/scalef-sync-daily.sh` (tự bỏ qua nếu hôm nay sync rồi) +
    `scripts/com.vietanh.eps-scalef-sync.plist` (mỗi 30 phút). **Còn lại — CFO tự cài** (không phải
    việc code, chỉ 2 lệnh `cp`/`launchctl load`, xem README).
  - **Còn lại, không phải việc code**: ghép tay 145 dòng ở `/scalef` (Tech/CFO), rồi chạy
    `npm run scalef:compare-views` để có số đối chiếu view thật lần đầu. `npm run build` +
    `tsc --noEmit` sạch, đã verify E2E thật (login + sync + ghi DB + hiện UI) với tài khoản dịch vụ
    thật, không còn giả định chưa kiểm chứng nào ở phần cốt lõi.
- **2026-07-22 — Kiểm tra lại toàn bộ + bảo mật**: xác minh trực tiếp Module 1-4 đều thật sự xong
  (không chỉ tin theo ghi chú) — DB khớp đúng số liệu (20 talent/31 kênh/14 campaign/317 video/145
  scalef_videos), `npx prisma migrate status` sạch, `npm run build` qua 19 route. Phát hiện xử lý
  ngay: token ScaleF thật từng in trong `scalef-dashboard/README.md` (từ trước Module 1) **vẫn còn
  nằm trong file** dù đã báo CFO xoay — đã xóa khỏi file (repo đó không phải git nên không bị kẹt
  trong lịch sử, nhưng CFO cần xác nhận đã xoay token thật trên ScaleF/Cloudflare chưa).
  Đã khảo sát thật `dealverse.pages.dev` trước khi viết prompt Module 5 (tránh lặp lại bài học sai
  sản phẩm như ScaleF): là trang deal/voucher công khai có thật, Module 5 chỉ cần lớp redirect độc
  lập phía trước, không cần tích hợp gì với tracking nội bộ của họ. Đã siết lại prompt Module 5 + 6
  trong `docs/MODULE_PROMPTS.md` theo đúng dữ liệu/schema thật hiện có (đặc biệt: Module 6 dashboard
  KHÔNG tính được doanh thu ScaleF theo Talent cho tới khi ghép tay xong ở `/scalef`; lợi nhuận sẽ
  sai cho tới khi backfill `production_fee_per_video`).
- **Module 5 — Dealverse affiliate link: HOÀN THÀNH (2026-07-22).**
  - **Nhóm bảng 7** (`docs/DB_SCHEMA.md`): `affiliate_links` (slug duy nhất, `target_url` mặc
    định trang chủ `dealverse.pages.dev`, sửa được tay), `link_clicks` (referrer, `source` suy từ
    UTM/hostname referrer, `user_agent`, `ip_hash` — không lưu IP thô), `link_conversions` (migrate
    theo schema nhưng **không có luồng ghi nào** — chưa xác minh được Dealverse có trả dữ liệu
    chuyển đổi hay không, không bịa nguồn dữ liệu).
  - **`src/app/go/[slug]/route.ts`**: redirect công khai, loại khỏi `src/proxy.ts` (thêm `go/` vào
    matcher, cùng cách `api/auth` đang được loại trừ) — verify thật: request `/go/<slug>` không có
    dòng `proxy.ts:` trong log (khác mọi route khác), xác nhận đúng không qua auth. Ghi click
    **best-effort, không `await`** (VPS chạy Node process sống lâu dài nên promise vẫn hoàn tất sau
    khi 302 đã gửi, lỗi ghi log chỉ `console.error`, không làm hỏng redirect). Slug/link đã Tắt →
    **404**, không redirect, không ghi click (quyết định cùng CFO — "Tắt" là tắt hẳn).
  - **Tự động tạo link khi thêm Talent mới** (`createTalent` trong `src/server/actions/talents.ts`,
    gọi `ensureAffiliateLink` trong `src/server/affiliate/links.ts`, lỗi tạo link không chặn tạo
    Talent). Talent cũ (trước Module 5) tạo link qua nút tay trên trang chi tiết — không backfill
    hàng loạt, đúng yêu cầu gốc.
  - **Trang chi tiết Talent**: thêm mục "Link affiliate Dealverse" — nút Tạo/Tắt/Bật lại link, sửa
    `target_url` tại chỗ, xem nhanh tổng số click. Cùng quyền `canEditTalent` đã có (CFO toàn
    quyền, MM chỉ Talent của mình) — không viết logic phân quyền mới.
  - **`/affiliate`** (CFO + MM, nav "Aff link Dealverse"): bảng performance theo Talent/nguồn/ngày,
    lọc theo khoảng ngày (mặc định 30 ngày, múi giờ VN) + Talent. Scope bằng `talentScopeWhere` có
    sẵn lồng qua quan hệ (`link.talent`) — MM chỉ thấy click của Talent mình quản lý, verify thật
    trên browser (MM Giang chỉ thấy 9 Talent của mình, CFO thấy tất cả).
  - **Đã kiểm tra sheet "AFF"** trong `data/Hồ sơ Talent.xlsx` theo yêu cầu CFO — hóa ra là dữ liệu
    gửi mẫu sản phẩm (tên, kênh, SĐT, địa chỉ, sản phẩm), không liên quan affiliate link Dealverse,
    không có gì để import.
  - **Verify E2E thật trên browser**: tạo link cho Talent "Thuý Thẩm" → `/go/thuy-tham-d69f62` 302
    đúng tới `dealverse.pages.dev` thật → 1 dòng `link_clicks` ghi đúng (source `direct`, ip đã
    hash) → hiện đúng trên `/affiliate` (cả 3 bảng) → bấm Tắt → mở lại `/go/...` nhận 404 → MM
    Giang tạo link cho Talent của mình ("Chi") thành công, không mở được trang Talent MM khác quản
    lý (404, đúng `talentScopeWhere` cũ). `npm run build` sạch, không lỗi server trong suốt quá
    trình verify.
- Tiếp theo theo lộ trình: **Module 6 — Dashboard/Insight**.
  "Bổ sung Module 2 — Đồng bộ Ambassador" (thiết kế xong, chưa code) vẫn có thể làm bất kỳ lúc nào,
  không chặn Module 6 — nên tham khảo `src/server/scalef/` (đã code, đã verify thật) làm khuôn
  mẫu khi code phần đó, vì cùng dạng bài (gọi API ngoài, validate zod, advisory lock, bảng log).
- Bộ prompt sẵn cho từng module (CFO copy vào chat mới, mỗi module 1 chat): `docs/MODULE_PROMPTS.md`.
- File gốc `PROJECT_EPS.txt` (bị lỗi encoding) đã được thay bằng file này; có thể xóa file cũ.

---

Tham khảo hệ thống files trước đây nếu cần.
Hiện tại các files đang có như sau: File điền thông tin profile talents và các thông tin kênh, định hướng. Trong file này cũng sẽ có sheet điền brief các camp từ Ambassador, có 1 sheet để MM điền videos đã air mỗi ngày lên kèm với cả brief comments mong muốn cùng với các note khác: https://docs.google.com/spreadsheets/d/10sy3TmBHJ-A2BVQkWOxbUWafFhmPQBM4zosrfDuT_sw/edit?gid=920985838#gid=920985838

File cơ chế hoạt động bao gồm cơ chế tính thưởng và lợi nhuận cho MM: https://docs.google.com/spreadsheets/d/15UZdH4fJeb_fs0v8XGTD0Lxhj6I2ThKQwC_CbcU5DDk/edit?gid=580753235#gid=580753235

Report tính lương hàng tháng của MM:
- MM Giang: https://docs.google.com/spreadsheets/d/1_NiE3qPLGJcWCqnYa8e1ev95C0LXK3FPOtbl7r7m9gg/edit?gid=891075856#gid=891075856
- MM Hà: https://docs.google.com/spreadsheets/d/1iJzSi52lQ0VahKQ_hp5IAZh40bYgOwFd-3euHEeRIR8/edit?gid=1365585835#gid=1365585835
