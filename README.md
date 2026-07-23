# EPS Platform — Vận hành nội bộ Escape Poverty Studio

Website quản lý vận hành nội bộ, thay thế Google Sheets. Tài liệu nghiệp vụ:
`docs/PROJECT_EPS.md`, thiết kế database: `docs/DB_SCHEMA.md`.

## Mới join dự án? Đọc theo thứ tự này

1. **`docs/PROJECT_EPS.md`** — bối cảnh nghiệp vụ, vai trò người dùng, mục tiêu dự án, quy trình
   vận hành thật (Talent → MM → Tech → ScaleF).
2. **`docs/DB_SCHEMA.md`** — thiết kế database + lý do đằng sau từng quyết định (đọc trước khi sửa
   `prisma/schema.prisma`, để hiểu VÌ SAO cấu trúc trông như vậy, không chỉ CÁI GÌ có sẵn).
3. README này — chạy dự án, cấu trúc thư mục, phân quyền, chi tiết từng module.
4. **`docs/MODULE_PROMPTS.md`** — lịch sử quyết định + prompt đã dùng cho từng module (kể cả phần
   chưa code) — hữu ích để biết việc gì đã cân nhắc và loại bỏ, tránh đề xuất lại.
5. **`docs/PAYROLL_FORMULA.md`** — công thức tính lương/thưởng Module 3 (bản public, không có số
   liệu tài chính thật — xem ghi chú đầu file).

Dự án tự deploy bởi CFO (không có team dev riêng), dùng Claude Code làm chính — quy trình làm
việc: mỗi module code trong 1 phiên Claude Code riêng, luôn qua Plan Mode trước khi code, verify
trên browser + `npm run build` trước khi coi là xong. Xem `docs/MODULE_PROMPTS.md` mục "Cách dùng"
để hiểu quy trình đầy đủ nếu bạn cũng dùng Claude Code cho dự án này.

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
npm run db:seed        # tạo tài khoản CFO (Team Finance) + dữ liệu mẫu, in mật khẩu ra console

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
src/auth.config.ts          # rule phân quyền route (admin-only prefix cho Team Tech/Team Finance, role staff)
src/auth.ts                 # đăng nhập email/mật khẩu (bcrypt)
src/lib/roles.ts            # isSystemAdmin/SYSTEM_ADMIN_ROLES — Team Tech (TECH) và Team Finance (CFO) ngang quyền
src/lib/authz.ts            # requireRole/requireUser/requireSystemAdmin + scope theo role (Talent/Campaign/Video)
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
src/server/insights/view-variance.ts # so view giả định vs thật — dùng chung cho script + insight rule
src/server/insights/engine.ts # runInsightRules() — module 6, 5 rule cảnh báo, dedupe/auto-resolve theo _key trong data
scripts/run-insights.ts      # CLI chạy engine insight (npm run insights:run), dùng chung cho cron
src/server/dashboard/        # finance.ts/team.ts/pipeline.ts — số liệu dashboard, thuần đọc, tách khỏi UI
src/app/(dashboard)/_components/ # AdminDashboard/MmDashboard/charts/banners/insights-panel — module 6
src/app/(dashboard)/         # các trang sau đăng nhập: /, /talents, /campaigns, /videos,
                             # /payroll, /booking, /affiliate, /scalef, /expenses, /admin/users
src/app/login/               # trang đăng nhập
src/generated/prisma/        # code Prisma tự sinh — KHÔNG sửa tay
```

## Phân quyền (module 1 + 2 + 3 + 4 + 5 + 6)

Role lưu trong DB vẫn là 4 giá trị enum `CFO | MM | TALENT | TECH` (không đổi, tránh migration rủi
ro) — **tên hiển thị trên toàn hệ thống** khác với tên enum:

| Giá trị enum DB | Tên hiển thị | Vai trò |
|---|---|---|
| `CFO` | **Team Finance** | System admin — quyền toàn hệ thống |
| `TECH` | **Team Tech** | System admin — quyền toàn hệ thống |
| `MM` | Media Manager | Scope theo Talent được giao |
| `TALENT` | Talent | Chưa có giao diện riêng |

**Team Tech và Team Finance là hai nhóm quản trị toàn hệ thống, quyền ngang nhau** — cả hai xem,
tạo, sửa, giao việc, quản lý được toàn bộ dữ liệu/chức năng, trừ các bước đã thiết kế riêng cho hệ
thống tự động (VD: cron đồng bộ ScaleF, sync Ambassador). Được thực thi qua helper dùng chung
`isSystemAdmin()`/`requireSystemAdmin()` ở `src/lib/roles.ts` + `src/lib/authz.ts`, không rải điều
kiện `role === "CFO"` rời rạc ở từng nơi.

| Chức năng | Team Tech / Team Finance | MM |
|---|---|---|
| Quản lý tài khoản `/admin/users` | ✅ | ❌ |
| Xem Talent | Tất cả | Chỉ Talent mình quản lý |
| Tạo/sửa Talent + kênh | ✅ | Chỉ Talent của mình |
| Xem campaign | Tất cả | Campaign mình phụ trách + campaign có video của Talent mình |
| Tạo/sửa campaign, giao Talent | ✅ | Chỉ campaign mình phụ trách |
| Log video, sửa brief/feedback/duyệt | ✅ | Chỉ Talent của mình |
| Cập nhật pipeline (Đã nhận → ads → tương tác) | ✅ (mọi video) | ❌ |
| **Nộp video lên ScaleF** (bước cuối pipeline) | ✅ (mọi video) | ❌ |
| **Xác nhận đã nộp ScaleF** (đối soát) | ✅ | Chỉ Talent của mình |
| Đặt cơ chế thưởng Campaign (đồng/view...) | ✅ | ❌ |
| Tạo/duyệt/trả kỳ lương, quản lý booking deal | ✅ | ❌ |
| Xem lương/thưởng (`/payroll`, `/booking`) | Tất cả | Chỉ phần của mình |
| Đồng bộ ScaleF, ghép tay video chưa khớp (`/scalef`) | ✅ | ❌ |
| Tạo/tắt link affiliate, sửa `target_url` (trang chi tiết Talent) | ✅ | Chỉ Talent của mình |
| Xem performance click (`/affiliate`) | Tất cả | Chỉ Talent mình quản lý |
| Tạo/sửa/xóa chi phí (`/expenses`) | ✅ (không phân biệt người tạo) | ❌ |
| Chạy insight engine ("Chạy insight ngay" trên Tổng quan) | ✅ | ❌ (chỉ xem) |
| Xem dashboard Tổng quan | Bản gộp tài chính + vận hành (như nhau cả 2 role) | Bản riêng: hiệu suất team mình |
| Xem cảnh báo (insight) | Tất cả insight có role mình trong `visibleToRoles` | Chỉ insight liên quan team mình (lọc theo `managerId`) |

Quyền được kiểm tra 2 lớp: proxy chặn route (`src/auth.config.ts`), và mọi server action tự check
lại (`requireRole`/`requireSystemAdmin`) — nên kể cả gọi thẳng API cũng không vượt quyền được. Sửa
URL hoặc gọi server action trực tiếp không đổi được scope: MM luôn bị áp `*ScopeWhere` ở tầng
query, không chỉ ẩn menu/nút ở frontend.

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
npm run insights:run                                      # chạy engine insight rule-based (module 6), in tóm tắt
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

Công thức đầy đủ: `docs/PAYROLL_FORMULA.md` (bản public). Bản gốc kèm số liệu tài chính thật đã
đối chiếu ở `data/co-che-luong-thuong-mm.md` trên máy CFO — không có trong repo (`/data/`
gitignore vì chứa dữ liệu tài chính/cá nhân nhạy cảm). Tóm tắt luồng:

1. **Team Tech / Team Finance đặt cơ chế trên từng Campaign** (`/campaigns/[id]`, mục "Cơ chế
   thưởng MM"): đồng/view, chi phí cố định/view, %chi phí max (để trống thì tự tra tier theo
   đồng/view). Campaign chưa có cơ chế bị bỏ qua khi tính nháp (cảnh báo rõ, không tính bừa).
2. **Team Tech / Team Finance tạo kỳ lương** (`/payroll`, chọn tháng) — hệ thống tự tính từ `Video`
   log thật (đếm video × 80.000 view/video mặc định, chưa có ScaleF thật) + `BookingDeal` trong
   tháng + mốc thưởng Talent, theo `reward_policies` đang hiệu lực tại tháng đó (versioned theo
   `effective_from/to`).
3. **Team Tech / Team Finance duyệt** (khoá tính lại, đóng dấu mốc thưởng tuyển dụng đã trả) →
   **đánh dấu đã trả**.
4. MM xem `/payroll` chỉ thấy phần của mình, breakdown chi tiết từng campaign/booking/thưởng để tự
   đối chiếu — không thấy MM khác.

**Booking** (`/booking`, Team Tech / Team Finance tạo/sửa): chia 4 bên mẫu 25% - MM 25% - công ty 25% - người bán deal
25% (`reward_policies` name `booking_split`) — người bán deal mặc định = MM quản lý, đổi được nếu
người khác chốt deal.

**Thưởng Talent** (không qua `/booking` hay `/campaigns`, tính tự động trong kỳ lương): thưởng
tuyển dụng (giới thiệu Talent mới đạt 10/40 video, trả cho người giới thiệu — cần đặt
`Talent.referredById`), thưởng Top 1/2/3 công ty theo video/tháng, thưởng cố định theo mốc số
lượng video. Cả 3 đọc từ `reward_policies` applies_to=TALENT.

✅ `Talent.productionFeePerVideo` đã backfill bằng số thật từ report (2026-07-22, xem
`scripts/backfill-production-fees.ts`) — trước đó là 0 cho toàn bộ Talent. Lưu ý: chi phí phụ
thuộc CAMPAIGN chứ không phụ thuộc Talent (cùng MM + cùng campaign → mọi Talent cùng đơn giá), nên
số backfill chỉ là mặc định khởi điểm — MM vẫn nên tự xác nhận/sửa số thật theo từng video khi nộp
(ô "Chi phí sản xuất" ở `/videos/new` và `/videos/[id]`). Xem thêm `docs/PAYROLL_FORMULA.md`.

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
   ghép tay `/scalef` (quyền Team Tech / Team Finance) — sync không bao giờ ghi đè `video_id` đã ghép tay.
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
3. **`/affiliate`** (Team Tech / Team Finance + MM) — bảng performance click theo Talent / nguồn / ngày, lọc theo
   khoảng ngày (mặc định 30 ngày gần nhất, múi giờ VN) và Talent. MM chỉ thấy click của Talent
   mình quản lý (dùng chung `talentScopeWhere` — không có phân quyền riêng cho module này).
4. **`link_conversions`** đã có bảng trong DB (dự phòng) nhưng **chưa có luồng ghi nào** — chưa
   xác minh được Dealverse có trả dữ liệu chuyển đổi hay không.

## Dashboard + Insight (module 6)

> Lưu ý đặt tên: nhánh/PR "module-6-team-tech-finance-parity" (đã merge trước module này) thật ra
> là việc cho Team Tech/Team Finance quyền ngang nhau (xem mục "Phân quyền" ở trên), KHÔNG phải
> module Dashboard/Insight — trùng số ngoài ý muốn. Module 6 THẬT (mô tả dưới đây, theo
> `docs/MODULE_PROMPTS.md`) là phần dashboard + cảnh báo tự động.

Trang Tổng quan (`/`) giờ gộp 2 phần: dải thẻ số liệu nhanh cũ (mọi role) + dashboard riêng theo
nhóm quyền — **`AdminDashboard`** (Team Tech + Team Finance, dùng chung 1 view vì 2 role đã ngang
quyền từ PR parity ở trên: gồm cả phần tài chính lẫn phần vận hành pipeline/ScaleF, khác thiết kế
gốc trong `docs/MODULE_PROMPTS.md` vốn tách riêng CFO/Tech — quyết định đổi này ghi trong
`docs/PROJECT_EPS.md`) và **`MmDashboard`** (MM, chỉ số liệu team mình).

1. **`src/server/dashboard/finance.ts`** — doanh thu (`contractValue` theo tháng `Campaign.startDate`
   + ScaleF thật CHỈ tính video đã ghép Talent ở `/scalef`), chi phí (`Video.productionCost` +
   `Expense` ADS/SALARY/OTHER/PRODUCTION-không-gắn-video + `PayrollItem.total` đã tính sẵn ở module
   3), lợi nhuận, chuỗi 6 tháng gần nhất, top 5 Talent/Campaign theo số video. Cũng tính 2 số liệu
   cảnh báo bắt buộc: tỉ lệ `scalef_videos` đã ghép Talent, và tỉ lệ video chưa điền chi phí sản
   xuất (tách riêng trước/sau ngày backfill 2026-07-22).
2. **`src/server/dashboard/pipeline.ts`** — phễu số video theo `pipelineStatus`, số `scalef_videos`
   chưa ghép, lần đồng bộ ScaleF gần nhất (đọc lại, không đồng bộ trùng UI của `/scalef`).
3. **`src/server/dashboard/team.ts`** — số liệu team MM (`talentScopeWhere`/`videoScopeWhere` sẵn
   có), "video chậm tiến độ" đọc thẳng insight `VIDEO_LATE` đang mở thay vì tính lại ngưỡng 48h.
4. **`src/server/insights/engine.ts`** (`runInsightRules()`, chạy qua `npm run insights:run` hoặc
   nút "Chạy insight ngay" trên Tổng quan — server action `runInsightsNow`, quyền
   `requireSystemAdmin()`) — 5 rule, ghi bảng `insights`:
   - `VIDEO_LATE` — video quá 48h chưa qua bước pipeline tiếp theo (theo `video_pipeline_events`).
   - `VIEW_DROP` — view (đọc từ `scalef_daily_stats`, số **lũy kế**, luôn lấy delta ngày gần nhất
     so trung bình 7 ngày trước) giảm >30%, chỉ tính video đã ghép ScaleF.
   - `SCRAPER_FAILED` — đọc `scrape_runs`/`ScrapeRun` (**không phải** `sync_runs`/`SyncRun`, bảng đó
     dành cho đồng bộ Ambassador chưa code).
   - `TALENT_INACTIVE` — Talent ACTIVE 14 ngày không có video air mới.
   - `VIEW_ASSUMPTION_MISMATCH` — lệch >30% giữa view thật vs `avgViewsPerVideo` giả định (dùng lại
     `src/server/insights/view-variance.ts`, cũng là logic đứng sau `scalef:compare-views`).
   Mỗi insight tự nhúng khóa xác định (`data._key`) để lần chạy sau biết tạo mới/giữ nguyên/tự đóng
   (`resolvedAt`) — chạy lại nhiều lần không tạo trùng, xem comment đầu file để hiểu cơ chế dedupe.
5. **`/expenses`** (Team Tech/Team Finance, `requireSystemAdmin()`) — CRUD chi phí ADS/SẢN
   XUẤT/LƯƠNG/KHÁC, gắn tùy chọn campaign hoặc 1 video cụ thể (dán link, server tự tìm theo
   `videoUrl`). Không phân biệt người tạo khi sửa/xóa (đúng triết lý ngang quyền Team Tech/Finance).
6. Biểu đồ dùng [Recharts](https://recharts.org) (`src/app/(dashboard)/_components/finance-charts.tsx`,
   `"use client"`) — mọi tính toán/gộp số liệu làm ở server (`src/server/dashboard/`), component
   chart chỉ nhận mảng phẳng và vẽ.

⚠ **2 banner cảnh báo dữ liệu bắt buộc** (`data-quality-banners.tsx`) hiện ngay trên Tổng quan cho
Team Tech/Team Finance, không bao giờ ẩn số 0 gây hiểu nhầm: (1) tỉ lệ `scalef_videos` đã ghép được
Talent + số tiền/view thật chưa gắn được vào ai; (2) tỉ lệ video thiếu chi phí sản xuất, tách rõ
"video cũ trước backfill — bình thường" khỏi "video mới vẫn thiếu — lỗ hổng nhập liệu thật".
