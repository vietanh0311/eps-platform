# EPS Platform — Vận hành nội bộ Escape Poverty Studio

Website quản lý vận hành nội bộ, thay thế Google Sheets. Tài liệu nghiệp vụ:
`../docs/PROJECT_EPS.md`, thiết kế database: `../docs/DB_SCHEMA.md`.

## Tech stack
Next.js 16 (App Router, TypeScript) · PostgreSQL + Prisma 7 · Auth.js (NextAuth v5) ·
Tailwind CSS 4 + shadcn/ui · Deploy dự kiến: VPS + Docker Compose (Coolify).

## Chạy trên máy dev (macOS, Postgres qua Homebrew)

```bash
# 1. Postgres (đã cài postgresql@17 qua brew)
brew services start postgresql@17

# 2. Biến môi trường: copy .env.example -> .env, điền DATABASE_URL + AUTH_SECRET
#    (AUTH_SECRET sinh bằng: openssl rand -base64 32)

# 3. Cài deps + migrate + seed
npm install
npx prisma migrate dev
npm run db:seed        # tạo tài khoản CFO + dữ liệu mẫu, in mật khẩu ra console

# 4. Chạy
npm run dev            # http://localhost:3000
```

Trên máy có Docker: `docker compose up -d` để chạy Postgres thay cho Homebrew.

## Cấu trúc thư mục chính

```
prisma/schema.prisma        # cấu trúc database (nguồn sự thật, theo docs/DB_SCHEMA.md)
prisma/seed.ts              # dữ liệu ban đầu (idempotent)
scripts/import-talents.ts   # import Talent từ Excel export Google Sheets (có chế độ preview)
scripts/import-videos.ts    # import log video air từ Excel — Module 2 (có chế độ preview)
src/proxy.ts                # chặn route theo đăng nhập + role (Next 16 thay middleware.ts)
src/auth.config.ts          # rule phân quyền route (CFO-only prefix, role staff)
src/auth.ts                 # đăng nhập email/mật khẩu (bcrypt)
src/lib/authz.ts            # requireRole/requireUser + scope theo role (Talent/Campaign/Video)
src/lib/audit.ts            # ghi audit_logs cho mọi thao tác tạo/sửa/xóa
src/lib/video-url.ts        # nhận diện nền tảng/handle từ link video — dùng chung app + script import
src/server/actions/         # toàn bộ logic ghi dữ liệu (server actions, đều check quyền)
src/server/payroll/compute.ts # engine tính nháp lương/thưởng (module 3) — thuần hàm, dùng chung
                             # cho app và scripts/reconcile-payroll.ts
scripts/seed-reward-policies.ts # seed reward_policies (công thức MM + thưởng Talent, versioned)
scripts/reconcile-payroll.ts  # đối chiếu số tính ra với report lương MM Giang/Hà thật
src/server/scalef/client.ts  # gọi API admin ScaleF (ambassador.koc.com.vn/api/admin), validate zod
src/server/scalef/sync.ts    # syncScalef() — module 4, khớp Talent qua hashtag, upsert scalef_*
scripts/sync-scalef.ts       # CLI đồng bộ ScaleF (npm run scalef:sync), dùng chung cho launchd
scripts/compare-avg-views.ts # báo cáo đối chiếu view giả định vs view thật (chỉ đọc)
src/server/affiliate/links.ts        # slugify + ensureAffiliateLink() — module 5, idempotent
src/server/actions/affiliate-links.ts # tạo/tắt link, sửa target_url — đều check canEditTalent
src/app/go/[slug]/route.ts   # redirect công khai /go/<slug> — module 5, KHÔNG qua proxy.ts
src/app/(dashboard)/         # các trang sau đăng nhập: /, /talents, /campaigns, /videos,
                             # /payroll, /booking, /affiliate, /scalef, /admin/users
src/app/login/               # trang đăng nhập
src/generated/prisma/        # code Prisma tự sinh — KHÔNG sửa tay
```

## Phân quyền (module 1 + 2 + 3 + 4 + 5)

| Chức năng | CFO/COO | MM | Tech |
|---|---|---|---|
| Quản lý tài khoản `/admin/users` | ✅ | ❌ | ❌ |
| Xem Talent | Tất cả | Chỉ Talent mình quản lý | Tất cả (chỉ đọc) |
| Tạo/sửa Talent + kênh | ✅ | Chỉ Talent của mình | ❌ |
| Xem campaign | Tất cả | Campaign mình phụ trách + campaign có video của Talent mình | Tất cả (chỉ đọc) |
| Tạo/sửa campaign, giao Talent | ✅ | Chỉ campaign mình phụ trách | ❌ |
| Log video, sửa brief/feedback/duyệt | ✅ | Chỉ Talent của mình | ❌ |
| Cập nhật pipeline (Đã nhận → ads → tương tác) | ✅ | ❌ | ✅ (mọi video) |
| **Nộp video lên ScaleF** (bước cuối pipeline) | ✅ | ❌ | ✅ (mọi video) |
| **Xác nhận Tech đã nộp ScaleF** (đối soát) | ✅ | Chỉ Talent của mình | ❌ |
| Đặt cơ chế thưởng Campaign (đồng/view...) | ✅ | ❌ | ❌ |
| Tạo/duyệt/trả kỳ lương, quản lý booking deal | ✅ | ❌ | ❌ |
| Xem lương/thưởng (`/payroll`, `/booking`) | Tất cả | Chỉ phần của mình | ❌ (không có quyền) |
| Đồng bộ ScaleF, ghép tay video chưa khớp (`/scalef`) | ✅ | ❌ | ✅ |
| Tạo/tắt link affiliate, sửa `target_url` (trang chi tiết Talent) | ✅ | Chỉ Talent của mình | ❌ |
| Xem performance click (`/affiliate`) | Tất cả | Chỉ Talent mình quản lý | ❌ (không có quyền) |

Quyền được kiểm tra 2 lớp: proxy chặn route, và mọi server action tự check lại
(`requireRole`) — nên kể cả gọi thẳng API cũng không vượt quyền được.

Luồng ScaleF tách 2 bước độc lập: **Tech nộp** video lên hệ thống ScaleF (ghi
`scalef_submitted_by/at`) → **MM xác nhận lại** phần Tech đã nộp (ghi `scalef_confirmed_by/at`,
đối soát trước khi tính thưởng). Chưa nộp thì chưa xác nhận được — chặn ở server action.

## Lệnh hay dùng

```bash
npm run db:seed                                          # seed tài khoản (không tạo trùng)
npx prisma migrate dev --name <ten_thay_doi>             # tạo migration khi đổi schema
npx prisma studio                                        # xem/sửa dữ liệu bằng giao diện
npm run db:import-talents "data/Hồ sơ Talent.xlsx"       # xem trước import Talent; thêm --write để ghi thật
npm run db:import-videos                                 # liệt kê tháng có thể import log video
npm run db:import-videos -- --months=2026-01..2026-07    # xem trước; thêm --write để ghi thật
npm run db:seed-reward-policies                          # seed công thức lương/thưởng (idempotent)
npm run payroll:reconcile                                # đối chiếu số tính ra với report MM thật
npm run scalef:sync                                      # đồng bộ ScaleF thật (cần SCALEF_ADMIN_* trong .env)
npm run scalef:compare-views                             # so view giả định (80.000) vs view thật ScaleF
```

> Lưu ý Next 16: sau khi đổi `schema.prisma` + migrate, phải **khởi động lại dev server**
> để nạp lại Prisma client mới (dev server đang chạy giữ client cũ trong bộ nhớ).

## Import Talent từ Excel
File nguồn: `data/Hồ sơ Talent.xlsx` (export từ Google Sheets), đọc sheet
`Quản lý kênh + mẫu`. Script gom nhiều kênh của cùng một KOC theo **hashtag cá nhân
ScaleF + MM**, tự tạo tài khoản MM còn thiếu, và cảnh báo hashtag bị trùng giữa nhiều
người. Chạy không có `--write` để xem trước, thêm `--write` để ghi thật (idempotent —
chạy lại không tạo trùng).

## Import log video từ Excel
File nguồn: `data/Hồ sơ Talent.xlsx`, đọc các sheet `Quản lý air clip tháng X2026`
(hiện chỉ 2026-01 → 2026-07 đã kiểm chứng cấu trúc; 5 tháng 2025 chạy được ngay khi cần
bằng cách thêm vào `MONTH_SHEETS` trong script). Chạy không tham số để xem danh sách
tháng có thể import; thêm `--months=2026-01..2026-07` để xem trước, `--write` để ghi
thật, `--briefs` để nạp thêm nội dung từ sheet "Brief Tổng" khi tạo campaign mới.

Khớp Talent theo 3 bước (handle trong link → tên kênh hiển thị → tên cột Talent, thu hẹp
theo MM); dòng không khớp được liệt kê ra chứ không âm thầm bỏ qua. Ba luồng trạng thái
của video ánh xạ đúng 3 cột check trong sheet cũ, theo luồng **Tech nộp ScaleF / MM xác
nhận** (xem "Phân quyền" ở trên). Idempotent theo `video_url` — chạy lại nhiều tháng
chồng nhau không tạo trùng.

⚠ Campaign tự tạo từ cột "Campaign" trong sheet là nhóm **thô theo tên brand**
(`source = MANUAL`), không phải campaign thật từng đợt — xem `docs/DB_SCHEMA.md` nhóm 3
mục "Dữ liệu lịch sử" nếu module đồng bộ Ambassador sau này cần đối chiếu lại.

## Lương & thưởng (module 3)

Công thức đầy đủ + số liệu thật đã xác minh: `data/co-che-luong-thuong-mm.md`. Tóm tắt luồng:

1. **CFO đặt cơ chế trên từng Campaign** (`/campaigns/[id]`, mục "Cơ chế thưởng MM"): đồng/view,
   chi phí cố định/view, %chi phí max (để trống thì tự tra tier theo đồng/view). Campaign chưa có
   cơ chế bị bỏ qua khi tính nháp (cảnh báo rõ, không tính bừa).
2. **CFO tạo kỳ lương** (`/payroll`, chọn tháng) — hệ thống tự tính từ `Video` log thật (đếm video
   × 80.000 view/video mặc định, chưa có ScaleF thật) + `BookingDeal` trong tháng + mốc thưởng
   Talent, theo `reward_policies` đang hiệu lực tại tháng đó (versioned theo `effective_from/to`).
3. **CFO duyệt** (khoá tính lại, đóng dấu mốc thưởng tuyển dụng đã trả) → **đánh dấu đã trả**.
4. MM xem `/payroll` chỉ thấy phần của mình, breakdown chi tiết từng campaign/booking/thưởng để tự
   đối chiếu — không thấy MM khác.

**Booking** (`/booking`, CFO tạo/sửa): chia 4 bên mẫu 25% - MM 25% - công ty 25% - người bán deal
25% (`reward_policies` name `booking_split`) — người bán deal mặc định = MM quản lý, đổi được nếu
người khác chốt deal.

**Thưởng Talent** (không qua `/booking` hay `/campaigns`, tính tự động trong kỳ lương): thưởng
tuyển dụng (giới thiệu Talent mới đạt 10/40 video, trả cho người giới thiệu — cần đặt
`Talent.referredById`), thưởng Top 1/2/3 công ty theo video/tháng, thưởng cố định theo mốc số
lượng video. Cả 3 đọc từ `reward_policies` applies_to=TALENT.

⚠ `Talent.productionFeePerVideo` hiện = 0 cho toàn bộ Talent (chưa import từ Excel thật ở module
1) → `Video.productionCost` cũng = 0 cho video đã import trước module 3 → phần "Chi phí sản xuất"
trong lương MM sẽ sai tới khi backfill xong (đã tách thành việc riêng, xem đối chiếu trong
`data/co-che-luong-thuong-mm.md`).

## Đồng bộ ScaleF (module 4)

API-first, không scraper: `src/server/scalef/client.ts` gọi thẳng
`ambassador.koc.com.vn/api/admin` (login `/staffs/login`, cache token trong bộ nhớ theo lần chạy).
**Đã verify bằng tài khoản dịch vụ thật (2026-07-22)** — cấu trúc response, field name, và cách
lọc dưới đây là dữ liệu thật, không còn là giả định.

⚠ **`GET /contents` là danh sách TOÀN MẠNG LƯỚI ScaleF** (xác nhận thật ~44.000 content, không
riêng EPS) — vì vậy client KHÔNG paginate toàn bộ, mà gọi `keyword=<hashtag>` riêng cho từng
Talent đang active (server search substring trong `title`, đã verify khớp đúng 1 creator/lần).

1. **Cần tài khoản dịch vụ ScaleF riêng** (không phải tài khoản cá nhân) — điền vào `.env`:
   `SCALEF_ADMIN_EMAIL`, `SCALEF_ADMIN_PASSWORD` (`SCALEF_ADMIN_BASE_URL` để trống dùng default
   `https://ambassador.koc.com.vn/api/admin` — đúng domain đã verify, cẩn thận nếu điền tay vì 1
   domain gần giống `ambassador.scalef.com` KHÔNG hoạt động, trả HTTP 405).
2. `npm run scalef:sync` (hoặc nút "Đồng bộ ngay" trên `/scalef`) — khớp Talent qua
   `talents.scalefHashtag` trích từ hashtag trong caption video, tự phát hiện hashtag trùng nhiều
   Talent (không hardcode), chỉ tự ghép `video_id` khi thu hẹp được đúng 1 Talent + đúng 1 video
   ứng viên (đã nộp ScaleF, chưa bị `ScalefVideo` khác nhận). Trường hợp khác để trống, xử lý ở màn
   ghép tay `/scalef` (quyền TECH + CFO) — sync không bao giờ ghi đè `video_id` đã ghép tay.
   **Trong thực tế đa số content cần ghép tay** (lần chạy thật đầu: 145 content, 0 tự gán được —
   Talent thường có hàng chục video/tháng nên hashtag một mình không đủ chỉ đúng 1 video), đây là
   hành vi đúng thiết kế (thà hỏi tay còn hơn gán sai thưởng), không phải lỗi.
3. `npm run scalef:compare-views` — báo cáo CHỈ ĐỌC so `avgViewsPerVideo` giả định (80.000, đang
   dùng tính lương module 3) với view thật mới nhất trong `scalef_daily_stats`, theo tháng/Talent.
   Không ghi `reward_policies`, không đụng payroll. Cần ghép tay xong ở bước 2 trước mới có số để so.
4. **Tự động hoá free trên máy CFO** (cùng pattern launchd job `vcd-sync` đang chạy cho
   `vcd-clean`): cài `scripts/scalef-sync-daily.sh` + `scripts/com.vietanh.eps-scalef-sync.plist`
   (mỗi 30 phút, tự bỏ qua nếu hôm nay sync rồi):
   ```bash
   cp scripts/com.vietanh.eps-scalef-sync.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.vietanh.eps-scalef-sync.plist
   ```
   Khi lên VPS/Coolify thật: chuyển sang Coolify Scheduled Task chạy `npm run scalef:sync`, gỡ
   launchd job cũ (`launchctl unload ...`) — không cần sửa code.

## Link affiliate Dealverse (module 5)

Mỗi Talent có 1 link `/go/<slug>` để dán lên bio kênh social, quảng bá
[dealverse.pages.dev](https://dealverse.pages.dev) (trang deal/voucher công khai của bên thứ ba —
**không** hợp tác/không có API với EPS). App chỉ tự quản 1 lớp redirect độc lập để biết Talent nào
đưa traffic tới, không phụ thuộc Dealverse "biết" gì.

⚠ Khác hẳn `talents.referredById` (module 3, thưởng tuyển dụng — ai giới thiệu Talent này **vào
công ty**). Cùng chữ "giới thiệu/referral" nhưng 2 khái niệm không liên quan.

1. **Tự động tạo link khi thêm Talent mới** (`createTalent`), Talent tạo trước module 5 dùng nút
   "Tạo link affiliate" trên trang chi tiết Talent (`/talents/[id]`) — cùng chỗ có nút Tắt/Bật lại
   và ô sửa `target_url` (mặc định trang chủ Dealverse, đổi được để trỏ 1 deal cụ thể hơn).
2. **`/go/<slug>`** — route công khai, không đăng nhập (loại khỏi `src/proxy.ts`), ghi 1 dòng
   `link_clicks` (referrer, nguồn suy từ `?utm_source=`/hostname referrer, user agent, IP đã hash
   SHA-256 — không lưu IP thô) rồi 302 tới `target_url`. Ghi log **best-effort, không chặn
   redirect** — lỗi ghi log (nếu có) chỉ log ra console, không bao giờ làm hỏng redirect. Slug sai
   hoặc link đã **Tắt** → 404, không redirect, không ghi click ("Tắt" là tắt hẳn).
3. **`/affiliate`** (CFO + MM) — bảng performance click theo Talent / nguồn / ngày, lọc theo
   khoảng ngày (mặc định 30 ngày gần nhất, múi giờ VN) và Talent. MM chỉ thấy click của Talent
   mình quản lý (dùng chung `talentScopeWhere` — không có phân quyền riêng cho module này).
4. **`link_conversions`** đã có bảng trong DB (dự phòng) nhưng **chưa có luồng ghi nào** — chưa
   xác minh được Dealverse có trả dữ liệu chuyển đổi hay không.
