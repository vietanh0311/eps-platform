# EPS — Database Schema tổng thể

> **Bản sao cho GitHub** — bản gốc chỉnh sửa qua Claude Code tại `~/Claude/docs/DB_SCHEMA.md`
> (ngoài repo git), đồng bộ lại mỗi khi có thay đổi lớn. `prisma/schema.prisma` trong repo luôn là
> nguồn sự thật kỹ thuật chính xác nhất — tài liệu này giải thích LÝ DO đằng sau các quyết định.

Đã được CFO duyệt ngày 2026-07-21. Đây là tài liệu gốc cho Prisma schema.
Nguyên tắc: mỗi module triển khai sẽ migrate đúng nhóm bảng của module đó, không tạo trước toàn bộ.

## Quy ước chung
- Khóa chính: `id` kiểu cuid/uuid (Prisma default).
- Mọi bảng có `created_at`, `updated_at` (Prisma tự quản).
- Tiền tệ: lưu số nguyên VND (không dùng số thập phân).
- Enum viết HOA_SNAKE trong DB, hiển thị tiếng Việt ở UI.

## Vòng đời dữ liệu

```
Talent (hồ sơ, kênh)
   └─ nhận việc từ Campaign/Brief (MM giao)
        └─ Video được log hàng ngày (MM duyệt, feedback)
             └─ Pipeline Tech: RECEIVED → ADS_DONE → ENGAGEMENT_DONE → SENT_SCALEF
                  └─ Scraper ScaleF hàng ngày: video duyệt, view, thưởng
                       └─ Lương/thưởng theo kỳ (cơ chế MM + creator)
Talent ─── Link Dealverse riêng → click / nguồn traffic / chuyển đổi
Tất cả ──→ Dashboard + Insight theo role
```

## Nhóm 1 — Người dùng & phân quyền

### users
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | cuid PK | |
| email | text, unique | dùng đăng nhập |
| password_hash | text | Auth.js Credentials |
| full_name | text | |
| role | enum `CFO \| MM \| TALENT \| TECH` | phân quyền toàn hệ thống — tên hiển thị: `CFO` → "Team Finance", `TECH` → "Team Tech" (2 role này là system admin, quyền ngang nhau); `MM` scope theo Talent được giao. Xem `src/lib/roles.ts` |
| status | enum `ACTIVE \| DISABLED` | khóa tài khoản không xóa dữ liệu |

## Nhóm 2 — Talent

### talents
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | cuid PK | |
| user_id | FK → users, nullable, unique | tài khoản đăng nhập, gắn sau nếu cần |
| full_name | text | |
| phone | text, nullable | |
| content_direction | text | định hướng nội dung |
| status | enum `ACTIVE \| PAUSED \| STOPPED` | hoạt động / tạm dừng / nghỉ |
| manager_id | FK → users | MM quản lý |
| production_fee_per_video | int (VND) | 100–200k, dùng làm mặc định khi log video |
| joined_at | date | |
| notes | text, nullable | |
| scalef_username | text, nullable | Tên người dùng trên ScaleF (KOC Ambassador) |
| scalef_hashtag | text, nullable | **Hashtag cá nhân ScaleF — khóa nối dữ liệu scrape/thưởng ở Module 5** |
| tax_code | text, nullable | MST / tài khoản nhận tiền — dùng cho Module 6 (lương/thưởng) |

> Ghi chú (2026-07-22): 3 trường `scalef_*` / `tax_code` được bổ sung sau khi import dữ liệu thật — file Google Sheets lưu hashtag cá nhân ScaleF làm định danh KOC, đây là khóa để Module 5 gắn view/thưởng về đúng Talent.

### talent_channels
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | cuid PK | |
| talent_id | FK → talents | |
| platform | enum `TIKTOK \| FACEBOOK \| INSTAGRAM \| YOUTUBE \| OTHER` | |
| handle | text | tên kênh |
| url | text | |
| follower_count | int, nullable | cập nhật tay định kỳ |
| is_primary | boolean | kênh chính |

## Nhóm 3 — Campaign/Brief

> **Cập nhật 2026-07-22 — đồng bộ Campaign từ Ambassador.** CFO muốn campaign trên
> `ambassador.koc.com.vn/chien-dich` tự động cào về để MM chọn, và campaign này **là** campaign
> của hệ thống EPS — nằm chung một danh sách với campaign tạo tay, không phải kho riêng.
>
> Khảo sát trực tiếp API xác nhận: `GET https://ambassador.koc.com.vn/api/public/news?type=home_list`
> — **public, không cần đăng nhập**, trả 27 campaign đang chạy (`_id`, `title`, `desc` HTML thô,
> `startAt`/`endAt` UTC, `action.value` = link thể lệ, `photo`). Không dùng scraping/Playwright —
> đây là JSON có sẵn, bền hơn nhiều so với cào HTML.
>
> **Quyết định thiết kế (đã cân nhắc và loại bỏ phương án phức tạp hơn):** GỘP campaign
> Ambassador thẳng vào bảng `campaigns` hiện có (không tách bảng gương riêng), vì `_id` của
> Ambassador là khóa khớp chính xác tuyệt đối — khác hẳn tình huống ScaleF (nhóm 5) phải đoán mờ
> qua hashtag nên mới cần bảng đệm riêng. Không làm: bảng `brands`/`platforms` riêng, cơ chế
> "adopt/nhận" campaign (trạng thái `mm_id IS NULL` đã nói lên điều đó), bảng lưu lịch sử thay
> đổi từng field, cơ chế alias khớp dữ liệu cũ có hiệu lực theo thời gian. Lý do: hệ thống 4 MM +
> 1 CFO tự vận hành, 27 dòng dữ liệu — các cơ chế đó tốn nhiều công sức xây/bảo trì hơn giá trị
> thu về. Xem lại khi có bằng chứng cụ thể cần đến (không làm trước).

### campaigns
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | cuid PK | |
| name | text | |
| brand_name | text | |
| source | enum `AMBASSADOR \| MANUAL \| INTERNAL` | **Đổi so với bản đầu** (`SCALEF→MANUAL`, `OTHER→INTERNAL`) — ScaleF không phải nguồn campaign, nó là bước nộp video (đã có ở `videos.scalef_submitted_*`). `INTERNAL` cho việc nội bộ không phải campaign brand (đối chiếu dữ liệu cũ: "Booking", "Build Kênh", "Aff" — xem Module 2 phần import) |
| brief | text | nội dung brief — **MM viết/sửa tự do, đồng bộ không bao giờ đụng cột này** |
| contract_value | int (VND), nullable | giá trị booking nếu có |
| start_date / end_date | date | Quy đổi GMT+7 lúc ghi (xem cảnh báo múi giờ bên dưới), không lưu UTC thô |
| status | enum `NEW \| RUNNING \| DONE` | Vận hành EPS, không phải trạng thái trên Ambassador. Tự chuyển `NEW → RUNNING` khi có assignment đầu tiên; `→ DONE` là thủ công |
| notes | text, nullable | |
| source_url | text, nullable | Link thể lệ gốc (Ambassador hoặc nền tảng khác: tfluencer.vn, megalive.lussosaigon.vn...) — MM bấm mở tab mới xem brief đầy đủ |
| external_key | text, unique, nullable | Khóa upsert khi đồng bộ: `ambassador:<_id 24-hex>`. NULL = campaign tạo tay. Nhiều NULL hợp lệ trong unique index của Postgres |
| desc_html | text, nullable | Mô tả HTML thô lấy từ Ambassador. **Bắt buộc: KHÔNG render HTML trực tiếp** (`dangerouslySetInnerHTML`) — đây là dữ liệu từ bên ngoài, chèn `<script>` là chiếm được phiên CFO. Hiển thị bằng cách strip toàn bộ tag thành văn xuôi thường; brief đầy đủ có định dạng thì MM mở `source_url` xem bản gốc. Đồng bộ ghi đè cột này, cột `brief` (EPS) không bao giờ bị đụng |
| cover_url | text, nullable | Ảnh campaign (rút gọn 1 ảnh, không cần thêm bản banner ngang) |
| last_synced_at | timestamp, nullable | Lần cuối feed còn thấy `_id` này. "Hết hạn/biến mất" = suy ra từ cột này so với lần chạy `sync_runs` gần nhất SUCCESS — không lưu thêm cột trạng thái riêng |
| order_video_count | int, nullable | "Số video Order" (sheet Brief new/Sheet Order) |
| internal_deadline | date, nullable | "Deadline" nội bộ MM tự đặt — khác `end_date` của Ambassador |
| is_urgent | boolean, default false | cột "Mức độ" (Khẩn cấp) trong sheet cũ |
| raw | JSONB, nullable | Payload gốc từ Ambassador, **ghi đè mỗi lần sync** — đủ để debug khi API đổi cấu trúc, không cần bảng snapshot lịch sử riêng |
| merged_into_id | FK → campaigns, nullable, self-relation | **Thêm 2026-07-24 (Vấn đề 3)** — CFO/Tech duyệt tay tại `/campaigns/matching` xác nhận 2 campaign (thường 1 `MANUAL` + 1 `AMBASSADOR` cùng brand) là cùng 1 đợt thật, gộp toàn bộ `videos`/`campaign_assignments`/`expenses`/`campaign_managers` sang campaign kia. `null` = hoạt động bình thường; có giá trị = đã gộp, chỉ đọc, ẩn khỏi nơi chọn campaign đang hoạt động. Không xóa campaign (đúng nguyên tắc không xóa đã áp dụng cho Ambassador sync) |
| scalef_event_id | FK → scalef_events, nullable, `@unique` | **Thêm 2026-07-24 (Vấn đề 1)** — CFO/Tech duyệt tay tại `/campaigns/scalef-policy` xác nhận đúng ScaleF Event thật ứng với campaign này (khớp gợi ý theo `brand_name` ↔ `raw.partner.name`). Dùng để đọc `raw.reward` làm gợi ý `price_per_view` — không tự động khớp/áp dụng, CFO luôn xem/sửa/duyệt qua form "Cơ chế thưởng MM" có sẵn |

**Ai làm chủ cột nào** (quy tắc chống đồng bộ ghi đè dữ liệu người nhập — thực thi bằng cách hàm sync chỉ liệt kê đúng các cột này trong `update`, không dùng `update: {...payload}`):

| Đồng bộ ghi đè (Ambassador làm chủ) | Người dùng sở hữu (đồng bộ không bao giờ đụng) |
|---|---|
| `desc_html`, `source_url`, `cover_url` | `name` (chỉ seed lúc tạo mới, sau đó MM đổi tự do) |
| `start_date`, `end_date`, `last_synced_at`, `raw` | `brief`, `notes`, bảng `campaign_managers`, `status`, `contract_value` |
| | `order_video_count`, `internal_deadline`, `is_urgent`, `brand_name` |

### campaign_managers (mới, 2026-07-24 — Vấn đề 2)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | cuid PK | |
| campaign_id | FK → campaigns, `onDelete: Cascade` | |
| user_id | FK → users | |
| assigned_at | timestamp | |

*(Unique `(campaign_id, user_id)`.)* Thay cho `campaigns.mm_id` (1 FK nullable duy nhất) — campaign
giờ hỗ trợ **nhiều MM cùng phụ trách** (không giới hạn số lượng). Rỗng = "chưa nhận" (thay
`mm_id IS NULL` cũ); có ≥1 dòng = "của tôi" nếu user nằm trong đó. MM tự thêm chính mình bất kỳ
lúc nào (tự phục vụ, không cần CFO duyệt — `joinCampaignManager`); **gỡ chỉ system admin làm được**
(`removeCampaignManager`, CFO xác nhận việc này nhạy cảm hơn tự thêm). **Quan trọng: bảng này
KHÔNG liên quan tới công thức lương** — `src/server/payroll/compute.ts` tính hoa hồng MM theo
`talent.manager_id` (Talent của ai) trong từng campaign, hoàn toàn độc lập với ai đứng tên ở đây;
2 MM cùng phụ trách 1 campaign tự động được trả đúng theo phần việc thật (video/Talent riêng của
mình) mà không cần thêm logic chia thưởng nào — đã verify bằng dữ liệu thật (xem
`docs/PROJECT_EPS.md` mục Vấn đề 2).

### campaign_assignments
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | cuid PK | |
| campaign_id | FK → campaigns | |
| talent_id | FK → talents | |
| assigned_by | FK → users | |
| deadline | date, nullable | |
| status | enum `ASSIGNED \| IN_PROGRESS \| DONE \| CANCELLED` | |
| note | text, nullable | |

*(Unique `(campaign_id, talent_id)` — 1 Talent chỉ được giao 1 lần trong cùng campaign.)*

### sync_runs (mới)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | cuid PK | |
| source | text | `"ambassador_campaigns"` — dùng chung tên bảng cho ScaleF sync ở Module 5 sau này, khỏi tạo bảng riêng mỗi lần |
| started_at / finished_at | timestamp | |
| ok | boolean, default false | |
| items | int, default 0 | số campaign đọc được lần này |
| error | text, nullable | |

Hiện trên UI dạng 1 dòng đơn giản: *"Đồng bộ lần cuối 06:15 — OK — 27 campaign"*. Không cần bảng cảnh báo (`insights`) riêng cho việc này ở giai đoạn này — bảng đó còn chưa tồn tại (thuộc Module 6), và dòng trạng thái trên là đủ cho quy mô 4 người dùng.

### Dịch vụ đồng bộ — tóm tắt quyết định
- **Chạy ở đâu**: 1 file `src/server/ambassador/sync.ts` (~100–150 dòng) gọi trực tiếp 2 API
  (`/api/public/news?type=home_list` + `/api/public/partners` để suy brand lúc tạo mới, không lưu
  persist). KHÔNG cần container/worker riêng — chỉ 2 lệnh GET JSON, xong trong 1–2 giây, khác hẳn
  scraper Playwright ScaleF (nặng, cần giữ session).
- **Lịch chạy**: Coolify Scheduled Task, **1 lần/ngày** + nút "Đồng bộ ngay" (CFO/MM) gọi chung
  một hàm qua server action. Chống chạy chồng bằng `pg_try_advisory_lock` (2 dòng, không cần Redis).
- **Validate bằng zod trước khi ghi DB**: envelope sai (`code != 1`, `data.news` không phải mảng)
  → dừng, **không ghi một dòng nào**. Item thiếu `_id`/`title`/URL không hợp lệ → bỏ qua đúng item
  đó, ghi phần còn lại.
- **Không bao giờ xóa campaign.** Feed Ambassador chỉ liệt kê campaign đang chạy — hết hạn tự
  nhiên biến mất khỏi feed là bình thường, không phải bị xóa. `last_synced_at` không nhích lên nữa
  là đủ để biết "không còn trên Ambassador"; video/chi phí/lương đã gắn `campaign_id` không bị ảnh
  hưởng.
- **Múi giờ — bẫy lệch ngày, đã kiểm chứng bằng code thật**: `startAt`/`endAt` là UTC. Quy đổi
  bằng `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })`, **tuyệt đối không cắt
  chuỗi ISO**. Ví dụ đã chạy thật để xác minh: `endAt: "2026-09-30T16:59:59.203Z"` → GMT+7 là
  **30/09/2026 23:59:59 — vẫn cùng ngày 30/09**, KHÔNG lùi/tiến sang 01/10 (dễ tính nhầm do phép
  cộng giờ, đã verify bằng `Intl.DateTimeFormat` thật trước khi chốt vào tài liệu này).
- **`desc_html` là dữ liệu ngoài — không render trực tiếp** (rủi ro XSS thật, không phải lý
  thuyết). Strip tag hiển thị văn xuôi là đủ; link thể lệ gốc (`source_url`) cho MM xem bản đầy đủ.
- **Việc phi kỹ thuật đáng làm nhất**: CFO gửi 1 email cho đầu mối Ambassador/Accesstrade báo đang
  đọc endpoint public này để đồng bộ nội bộ — rủi ro lớn nhất không phải kỹ thuật mà là quan hệ
  đối tác (tài khoản ScaleF của EPS phụ thuộc nền tảng này).

### Dữ liệu lịch sử (log video cũ) — không cố khớp campaign
Đối chiếu 983 dòng "Campaign" trong sheet air clip cũ với 27 campaign Ambassador đang chạy: chỉ
~44% brand có thể tìm thấy trên Ambassador, và trong số đó nhiều brand có 2–4 campaign chạy song
song (Katinat, Lazada, VPBank...) nên **không xác định được chính xác campaign nào** chỉ từ tên
ngắn MM gõ tay. Quyết định: cột `videos.legacy_campaign_label` (text, giữ nguyên văn MM gõ,
`campaign_id = NULL`) — không dựng cơ chế khớp mờ/alias vì đã chứng minh bằng dữ liệu thật là
khớp 1:1 tưởng chừng chắc chắn (Highland, FPTShop, Aristino) vẫn sai. Từ ngày go-live tính năng
này, MM chọn campaign từ dropdown — `campaign_id` bắt buộc cho video mới, không còn ô nhập tự do.

> **⚠ Không khớp với dữ liệu Module 2 đã import (2026-07-22) — đã báo CFO, CFO chọn giữ nguyên.**
> Import log video 7 tháng 2026 (315 video, xem "Trạng thái hiện tại" PROJECT_EPS.md) làm TRƯỚC
> khi có phân tích 983-vs-27 ở trên, và dùng đúng cách khớp tag mà phân tích này chứng minh không
> đáng tin: tự tạo 14 `campaigns` từ cột "Campaign" trong sheet (Katinat, Highland, FPTShop,
> Aristino, HDBank, VPBank, Tiki, Nuti, Lusso, Soundcore, Phở Cung Đình, Vnshop, Techcombank,
> Booking), gắn `campaign_id` thẳng vào 315 video — **không** dùng `legacy_campaign_label`. 14
> campaign này đánh dấu `source = MANUAL` (không phải `AMBASSADOR`) chính vì lý do này: là nhóm
> theo TÊN BRAND thô (coarse), không phải campaign thật từng đợt trên Ambassador — 1 campaign
> "Katinat" ở đây có thể gộp nhiều đợt Katinat thật khác nhau. Khi module đồng bộ Ambassador chạy,
> **không tự ý ghép/xóa** 14 campaign MANUAL này vào campaign AMBASSADOR mới cùng tên — để CFO
> quyết định gộp tay nếu cần, vì nguồn gốc dữ liệu khác nhau (nạp tay từ Excel vs đồng bộ API).

## Nhóm 4 — Log video & Pipeline Tech

### videos (bảng trung tâm)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | cuid PK | |
| talent_id | FK → talents | |
| campaign_id | FK → campaigns, nullable | video ngoài campaign vẫn log được |
| air_date | date | ngày air |
| platform | enum như talent_channels.platform | |
| video_url | text | |
| brief_comment | text, nullable | comment mong muốn |
| feedback | text, nullable | feedback của MM |
| review_status | enum `PENDING \| APPROVED \| NEEDS_FIX` | luồng duyệt của MM |
| pipeline_status | enum `NOT_IN_PIPELINE \| RECEIVED \| ADS_DONE \| ENGAGEMENT_DONE \| SENT_SCALEF` | luồng của team Tech, tách riêng review_status |
| production_cost | int (VND) | mặc định theo talent, sửa được từng video |
| logged_by | FK → users | MM nộp link thay cho Talent |
| legacy_campaign_label | text, nullable | **Thiết kế, chưa migrate.** Dự kiến: tên campaign nguyên văn MM gõ tay trong sheet cũ — xem phần "Dữ liệu lịch sử" ở nhóm 3. 315 video import 2026-07-22 KHÔNG dùng cột này (dùng `campaign_id` thẳng, xem cảnh báo ở nhóm 3) |
| air_clip_code | text, nullable | "Mã air clip" của sheet cũ (vd `2026.07.02.01`) — giữ để đối chiếu ngược khi cần, không dùng để khớp gì |
| scalef_submitted_by | FK → users, nullable | **Tech** nộp video lên ScaleF — bước cuối của pipeline Tech |
| scalef_submitted_at | timestamp, nullable | thời điểm Tech nộp lên ScaleF |
| scalef_confirmed_by | FK → users, nullable | **MM xác nhận** phần Tech đã nộp — bước đối soát, không ghi đè 2 cột trên |
| scalef_confirmed_at | timestamp, nullable | thời điểm MM xác nhận |

> **Bản ghi video do MM tạo — MM nộp link vào hệ thống thay cho Talent** (Talent không có tài
> khoản đăng nhập): `logged_by` = MM nộp, `talent_id` = Talent được nộp thay, `video_url` = link.
>
> Video có **3 luồng trạng thái độc lập**, khớp đúng cách vận hành trong sheet cũ:
> 1. `review_status` — MM duyệt nội dung (cột "Hệ thống duyệt" nội bộ).
> 2. `pipeline_status` — Tech xử lý ads/tương tác rồi nộp ScaleF (cột "Tech check nhận video").
> 3. `scalef_submitted_*` / `scalef_confirmed_*` — **cập nhật 2026-07-22, khác quyết định ban đầu
>    ở đây (vốn ghi MM nộp)**: Tech là người nộp video lên ScaleF (bước cuối pipeline, khớp
>    "MM check đã gửi videos lên hệ thống" — thực ra là Tech gửi), MM chỉ **xác nhận lại** phần
>    Tech đã làm (đối soát trước khi tính thưởng). Việc nộp hiện là thao tác tay trên ScaleF, app
>    ghi nhận ai/khi nào; tự động hóa nộp qua API cân nhắc ở Module 4.

### video_pipeline_events
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | cuid PK | |
| video_id | FK → videos | |
| from_status / to_status | enum pipeline | |
| by_user | FK → users | |
| at | timestamp | |
| note | text, nullable | |

Lịch sử chuyển trạng thái — nguồn số liệu đo "video chậm tiến độ".

## Nhóm 5 — Đồng bộ ScaleF (Module 4 — API-first, không scraping)

> **Cập nhật 2026-07-22 — hoàn thành + đã verify bằng tài khoản dịch vụ thật, xem chi tiết trong
> `PROJECT_EPS.md` "Trạng thái hiện tại".** API dùng: `ambassador.koc.com.vn/api/admin` (`GET
> /contents`, `GET /events`), KHÔNG dùng `accesstrade_scalef`/`scalef-dashboard` (API khác domain,
> sai sản phẩm — xem cảnh báo trong PROJECT_EPS.md). Lưu ý: `/contents` là danh sách toàn mạng
> lưới ScaleF (~44.000 dòng) — worker lọc theo `keyword=<hashtag>` per-Talent, không paginate
> toàn bộ.

### scalef_videos
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | cuid PK | |
| video_id | FK → videos, nullable | ghép với video nội bộ; nullable vì API có thể thấy content chưa khớp — có màn hình ghép tay `/scalef` |
| scalef_key | text, unique | định danh trên ScaleF (`_id` content) |
| scalef_url | text | |
| title | text, nullable | **Thêm ngoài thiết kế gốc** — caption/title thô từ ScaleF, chứa hashtag Talent. Lưu lại để màn ghép tay tính lại candidate/xung đột hashtag mà không cần gọi lại API mỗi lần tải trang |
| approved_on_scalef | boolean | |
| first_seen_at / last_seen_at | timestamp | |

### scalef_daily_stats
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | cuid PK | |
| scalef_video_id | FK → scalef_videos | |
| stat_date | date | unique cùng scalef_video_id |
| views | int | |
| reward_amount | int (VND) | thưởng theo view/post |

Snapshot mỗi ngày, **chỉ thêm không sửa** — tính được tăng trưởng view và thưởng theo kỳ.

### scrape_runs
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | cuid PK | |
| started_at / finished_at | timestamp | |
| status | enum `SUCCESS \| FAILED` | |
| items_found | int | |
| error_message | text, nullable | |

Hiện trên dashboard Tech — scraper gãy là phát hiện trong ngày.

### scalef_events (mới — ngoài thiết kế gốc, theo yêu cầu bổ sung của CFO)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | cuid PK | |
| scalef_event_id | text, unique | `_id` của Event trên ScaleF (`GET /events`) |
| name | text | |
| status | text, nullable | |
| start_at / end_at | timestamp, nullable | |
| raw | JSONB, nullable | payload gốc, ghi đè mỗi lần sync — cùng kiểu `campaigns.raw` |
| last_synced_at | timestamp, nullable | |

Ban đầu chỉ **thu thập sẵn**, không xử lý gì — **Vấn đề 1 (2026-07-24) đã dùng tới**: field
`raw.reward` (chuỗi tự do do brand tự gõ trên ScaleF, vd `"20đ/view"`, `"120.000đ/post"`) được
parse bằng `parseScalefReward()` (`src/server/campaigns/scalef-policy.ts`) để đề xuất
`campaigns.price_per_view` cho CFO duyệt tại `/campaigns/scalef-policy`; `raw.partner.name` dùng
để khớp với `campaigns.brand_name`. Xem `campaigns.scalef_event_id` bên dưới nhóm 3.

## Nhóm 6 — Lương & thưởng

### reward_policies
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | cuid PK | |
| applies_to | enum `MM \| TALENT` | |
| name | text | |
| params | JSONB | công thức/ngưỡng — model chính xác khi làm module lương, đọc từ file cơ chế Sheets |
| effective_from / effective_to | date (to nullable) | cơ chế có phiên bản; lương tháng cũ tính theo cơ chế cũ |

### payroll_periods
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | cuid PK | |
| month | text `YYYY-MM`, unique | |
| status | enum `DRAFT \| APPROVED \| PAID` | |
| approved_by | FK → users, nullable | CFO duyệt |
| approved_at | timestamp, nullable | |

### payroll_items
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | cuid PK | |
| period_id | FK → payroll_periods | |
| user_id | FK → users, nullable | cho MM |
| talent_id | FK → talents, nullable | cho creator (một trong hai) |
| base_amount | int (VND) | |
| bonus_amount | int (VND) | |
| breakdown | JSONB | chi tiết từng khoản để đối soát — thay file report lương |
| total | int (VND) | |
| note | text, nullable | |

## Nhóm 7 — Dealverse (affiliate link)

### affiliate_links
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | cuid PK | |
| talent_id | FK → talents | |
| slug | text, unique | redirect nội bộ `/go/<slug>` |
| target_url | text | |
| is_active | boolean | |

Tạo tự động khi thêm Talent mới.

### link_clicks
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | cuid PK | |
| link_id | FK → affiliate_links | |
| clicked_at | timestamp | |
| referrer | text, nullable | |
| source | text, nullable | parse từ referrer/UTM |
| user_agent | text, nullable | |
| ip_hash | text, nullable | hash, không lưu IP thô |

### link_conversions (dự phòng)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | cuid PK | |
| link_id | FK → affiliate_links | |
| occurred_at | timestamp | |
| value | int (VND), nullable | |
| source | text, nullable | |

Kích hoạt khi xác định Dealverse có trả dữ liệu conversion.

## Nhóm 8 — Tài chính, Insight & Audit

### expenses
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | cuid PK | |
| category | enum `ADS \| PRODUCTION \| SALARY \| OTHER` | |
| amount | int (VND) | |
| incurred_at | date | |
| campaign_id | FK → campaigns, nullable | |
| video_id | FK → videos, nullable | |
| note | text, nullable | |
| created_by | FK → users | |

Chi phí ads của team Tech + chi phí khác — nguồn số liệu dashboard lợi nhuận CFO.

### insights
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | cuid PK | |
| type | text | ví dụ `VIDEO_LATE`, `VIEW_DROP`, `SCRAPER_FAILED` |
| severity | enum `INFO \| WARNING \| CRITICAL` | |
| visible_to_roles | mảng role | lọc theo role khi hiển thị |
| title / message | text | |
| data | JSONB | số liệu kèm theo |
| resolved_at | timestamp, nullable | |

### audit_logs
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | cuid PK | |
| user_id | FK → users | |
| action | text | CREATE/UPDATE/DELETE |
| entity | text | tên bảng |
| entity_id | text | |
| at | timestamp | |

## Ba quyết định thiết kế quan trọng

1. **`videos` là bảng trung tâm** — pipeline, ScaleF, chi phí, thưởng creator đều nối về nó. `review_status` (MM) và `pipeline_status` (Tech) là 2 cột riêng vì là 2 luồng việc của 2 team.
2. **Dữ liệu ScaleF tách khỏi dữ liệu nội bộ** — scraper không bao giờ ghi đè dữ liệu nhập tay; nhận diện sai vẫn sửa ghép được, không mất số liệu.
3. **Cơ chế thưởng + chi tiết lương lưu JSONB có phiên bản** — đổi công thức không phải đổi cấu trúc DB; mọi bảng lương cũ vẫn giải thích được "tính theo cơ chế nào".

## Điểm chờ xác nhận sau
1. Talent có cần đăng nhập không → quyết ở module phân quyền (schema đã hỗ trợ).
2. Nguồn doanh thu ngoài thưởng ScaleF + contract_value → bổ sung trước khi làm dashboard.
3. Công thức thưởng MM chi tiết → cần CSV/Excel export của 2 file cơ chế khi vào module lương.
