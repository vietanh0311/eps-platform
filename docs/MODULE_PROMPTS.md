# Bộ prompt sẵn cho từng module — copy nguyên khối vào chat mới

> **Bản sao cho GitHub** — bản gốc/đang chỉnh tại `~/Claude/docs/MODULE_PROMPTS.md` (ngoài repo
> git). Dù đây là tài liệu vận hành riêng cho CFO dùng với Claude Code, người không dùng Claude
> Code vẫn nên đọc: đây là lịch sử đầy đủ các quyết định thiết kế + lý do cho từng module (kể cả
> phần chưa code) — hữu ích để hiểu VÌ SAO code hiện tại trông như vậy.

## Cách dùng (đọc 1 lần)

1. **Mở chat mới tại đúng thư mục `~/Claude`** (thư mục đang dùng hiện tại) — để Claude tự nạp
   CLAUDE.md và memory dự án, không phải giải thích lại gì cả.
2. Mỗi chat = 1 module. Copy đúng prompt của module bên dưới, dán, xong việc thì đóng chat.
3. Mọi prompt đều bắt Claude: đọc docs trước → Plan Mode chờ anh duyệt → code → verify trên
   browser → **cập nhật lại docs** khi xong. Bước cuối này chính là thứ giúp chat sau rẻ token.
4. KHÔNG dán code hay dữ liệu vào chat — chỉ trỏ đường dẫn file, Claude tự đọc.

**Nếu đang làm dở mà chat quá dài**, gõ câu này rồi mở chat mới:
```
Dừng tại đây. Cập nhật chính xác trạng thái đang làm dở (đã xong gì, còn gì, file nào đang sửa)
vào mục "Trạng thái hiện tại" của docs/PROJECT_EPS.md để chat sau làm tiếp.
```
Chat mới chỉ cần: `Đọc docs/PROJECT_EPS.md rồi làm tiếp phần đang dở của Module X.`

**Việc lặt vặt** (sửa label, thêm cột, đổi màu…) — không cần Plan Mode, gõ thẳng:
```
Việc nhỏ trong eps-platform, không cần Plan Mode: <mô tả>. Sửa xong verify nhanh trên browser.
```

---

## Module 2 — Campaign/Brief + Log video (✅ đã code)

```
Đọc docs/PROJECT_EPS.md, docs/DB_SCHEMA.md và eps-platform/README.md trước khi làm gì.

Triển khai Module 2 — Campaign/Brief + Log video cho eps-platform:
- Migrate nhóm bảng 3 và 4 theo DB_SCHEMA.md: campaigns, campaign_assignments, videos,
  video_pipeline_events.
- UI: MM nhận brief/tạo campaign, giao Talent; MM log video air hàng ngày (link, kênh,
  campaign, talent, brief comment, feedback, trạng thái duyệt); Tech cập nhật pipeline
  (Đã nhận → Đã chạy ads → Đã chạy tương tác → Đã gửi ScaleF) kèm lịch sử ai-làm-lúc-nào.
- Tính năng trung tâm: MM NỘP LINK VIDEO VÀO HỆ THỐNG NÀY THAY CHO TALENT (Talent không có
  tài khoản đăng nhập). Form nộp video: MM chọn Talent mình quản lý, dán link video air, chọn
  campaign, brief comment — tạo bản ghi videos (logged_by = MM). Hỗ trợ nộp nhanh NHIỀU link
  một lần (textarea mỗi dòng 1 link, cùng talent/campaign) vì MM nộp hàng ngày số lượng lớn.
  Tách riêng: nút "Đã gửi lên ScaleF" ghi scalef_submitted_by/at (xem DB_SCHEMA.md — video có
  3 luồng trạng thái độc lập: MM duyệt nội dung / Tech chạy pipeline / MM gửi ScaleF, khớp 3
  cột check trong sheet cũ). Danh sách lọc được "chưa gửi ScaleF" để MM biết còn thiếu video nào.
- Phân quyền như ma trận module 1: MM chỉ thao tác trên Talent/video của mình, Tech chỉ
  sửa pipeline, CFO thấy tất cả.
- Dữ liệu thật nằm sẵn trong eps-platform/data/Hồ sơ Talent.xlsx: brief ở sheet "Brief new",
  "Sheet Order", "Brief Tổng"; log video ở các sheet "Quản lý air clip tháng ...". Cột air clip
  gồm: Date, Mã air clip, Link Air, Kênh Air, MM, Campaign, Talent, Tech check nhận video,
  MM check đã gửi, Hệ thống duyệt. Viết script import (preview trước, --write sau) và hỏi tôi
  muốn import những tháng nào.
- Làm theo nguyên tắc dự án: vào Plan Mode trình kế hoạch, chờ tôi duyệt mới code. Xong thì
  verify trên browser bằng cả 3 role, chạy npm run build, cập nhật "Trạng thái hiện tại"
  trong docs/PROJECT_EPS.md và eps-platform/README.md.
```

## Bổ sung Module 2 — Đồng bộ Campaign từ Ambassador (schema đã có sẵn, chỉ còn viết sync + UI)

```
Đọc docs/PROJECT_EPS.md và docs/DB_SCHEMA.md (nhóm 3 — mục "Cập nhật 2026-07-22 — đồng bộ
Campaign từ Ambassador" có đầy đủ thiết kế đã chốt qua workflow nhiều agent + phản biện, đừng
thiết kế lại).

QUAN TRỌNG — đọc kỹ trước khi lên kế hoạch, tránh làm lại việc đã xong: schema cho tính năng này
ĐÃ ĐƯỢC MIGRATE SẴN từ lúc giải quyết xung đột 2 phiên Claude Code chạy song song hôm trước (xem
docs/PROJECT_EPS.md mục Module 2). Đọc thẳng eps-platform/prisma/schema.prisma để tự xác nhận
model Campaign đã có: mmId (String? nullable, MM tự "Nhận"), descHtml/coverUrl/lastSyncedAt/raw
(Ambassador làm chủ), orderVideoCount/internalDeadline/isUrgent (người dùng tự điền), sourceUrl +
externalKey (đã có, unique nullable), enum CampaignSource đã là AMBASSADOR|MANUAL|INTERNAL (không
còn SCALEF|OTHER), model SyncRun + bảng sync_runs đã tồn tại. NẾU đọc thấy đúng như trên thì
KHÔNG migrate gì thêm — việc còn lại CHỈ là viết code gọi API + upsert + UI (mục 1-4 dưới đây,
đánh số lại từ bản thiết kế gốc vì bước "migrate schema" đã xong). Nếu đọc thấy KHÁC (ai đó đã
đổi lại), dừng lại hỏi tôi trước khi tự sửa.

Bối cảnh thêm: campaigns hiện có 14 dòng, videos 317 dòng — đều từ import lịch sử
(scripts/import-videos.ts, source="MANUAL", tự nhóm theo tên brand thô, CFO đã biết và chấp nhận
hạn chế này). Đây là dữ liệu bình thường đã có sẵn, KHÔNG phải dấu hiệu xung đột — sync Ambassador
chỉ thêm campaign MỚI với source="AMBASSADOR" song song, không đụng 14 campaign MANUAL đó.

Tham khảo mẫu code THẬT đã verify hoạt động đúng, cùng dạng bài (gọi API ngoài định kỳ, validate
zod, chống chạy chồng, upsert, bảng log riêng): eps-platform/src/server/scalef/client.ts +
sync.ts (Module 4, đã chạy thật với dữ liệu production) — nên theo cùng cấu trúc file/pattern đó
cho nhất quán, đừng phát minh cấu trúc khác.

Triển khai đúng theo thiết kế đã chốt:

1. Validate dữ liệu ngoài bằng zod (đã có zod v4.4.3 trong package.json — z.looseObject,
   z.iso.datetime, z.url() dùng được):
   - src/server/ambassador/schema.ts: NewsItem (_id regex 24-hex bắt buộc, title, desc default
     '', startAt/endAt là z.iso.datetime({offset:true}), action.value là z.url()). NewsEnvelope
     (refine code === 1, data.news là mảng). PartnersEnvelope — CHÚ Ý cấu trúc lồng 2 tầng thật:
     {code, data: {data: [...]}} — đã verify trực tiếp, KHÔNG phải {code, data: [...]}.

2. Dịch vụ đồng bộ (src/server/ambassador/sync.ts), hàm syncAmbassadorCampaigns(trigger):
   - GET https://ambassador.koc.com.vn/api/public/news?type=home_list và
     https://ambassador.koc.com.vn/api/public/partners (public, KHÔNG cần đăng nhập/token).
   - Khóa pg_try_advisory_lock (chọn 1 số cố định, VD 778001) chống chạy chồng, release ở finally.
   - Validate response bằng zod TRƯỚC khi đụng DB. Envelope sai cấu trúc (code != 1, data.news
     không phải mảng, JSON lỗi) → ghi SyncRun{ok:false, error}, RETURN NGAY, không ghi một dòng
     campaign nào. Item lẻ sai schema → bỏ qua đúng item đó, tiếp tục các item còn lại.
   - Quy đổi startAt/endAt (UTC) sang GMT+7 bằng
     Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Ho_Chi_Minh'}).format(new Date(iso)) rồi mới
     lấy phần ngày — TUYỆT ĐỐI không cắt chuỗi ISO trực tiếp. Tự verify công thức bằng
     node -e trước khi tin: endAt "2026-09-30T16:59:59.203Z" phải ra 2026-09-30 (CÙNG ngày),
     không phải 2026-10-01 — đây là chỗ 2 trong số các bản thiết kế trước đã tính sai ví dụ dù
     công thức đúng, nên đừng chỉ tin lời giải thích, chạy thử để chắc chắn.
   - Suy brandName: parse partner slug từ segment đầu path của action.value, đối chiếu
     /api/public/partners để lấy tên đẹp; fallback lấy phần trước dấu "-" đầu tiên của title nếu
     không khớp được partner nào (đã verify: có URL nằm trên tối thiểu 5 host khác nhau, không
     phải chỉ ambassador.koc.com.vn — hàm parse phải chịu được điều này, dùng try/catch quanh
     new URL() và có giá trị mặc định hợp lý khi parse lỗi).
   - Upsert theo externalKey = "ambassador:" + item._id:
     - Tạo mới: set toàn bộ field, mmId = null, status = "NEW", source = "AMBASSADOR".
     - Đã tồn tại: CHỈ ghi đè descHtml/sourceUrl/coverUrl/startDate/endDate/lastSyncedAt/raw.
       KHÔNG BAO GIỜ đụng name/brief/mmId/status/contractValue/notes/orderVideoCount/
       internalDeadline/isUrgent/brandName — liệt kê tường minh trong object update của
       Prisma, không dùng spread nguyên payload vào update.
   - KHÔNG xóa campaign nào. Feed chỉ liệt kê campaign đang chạy — hết hạn tự nhiên biến mất
     khỏi feed là bình thường, không phải bị xóa; lastSyncedAt không tăng nữa là đủ để biết.
   - Ghi 1 dòng SyncRun khi xong (ok/items/error).

3. Chạy đồng bộ:
   - scripts/sync-ambassador.ts: entry CLI gọi syncAmbassadorCampaigns("CRON"), in tóm tắt.
     Thêm script "sync:ambassador": "tsx scripts/sync-ambassador.ts" vào package.json.
   - Server action syncAmbassadorNow() trong src/server/actions/campaigns.ts: requireRole("CFO",
     "MM"), gọi syncAmbassadorCampaigns("MANUAL"), revalidatePath("/campaigns").

4. UI (tái dùng màn hình đã có, KHÔNG tạo tab/màn hình "kho campaign" riêng):
   - campaigns/page.tsx: thêm chip lọc "Của tôi" (mmId = tôi) / "Chưa nhận" (mmId IS NULL) /
     "Tất cả"; cột badge nguồn theo CAMPAIGN_SOURCE_LABELS mới; dòng trạng thái đồng bộ cuối
     (đọc SyncRun mới nhất source="ambassador_campaigns") + nút "Đồng bộ ngay" (chỉ CFO/MM).
   - campaigns/[id]/page.tsx: nếu campaign.mmId là null → hiện nút "Nhận" thay vì form sửa đầy
     đủ (MM set mmId = mình; CFO chọn MM bất kỳ). Hiển thị descHtml dạng VĂN XUÔI THƯỜNG, STRIP
     TOÀN BỘ TAG HTML — KHÔNG dùng dangerouslySetInnerHTML (đây là dữ liệu từ bên ngoài, chèn
     script vào là chiếm được phiên CFO, rủi ro thật không phải lý thuyết). Link thể lệ gốc
     (sourceUrl) mở tab mới với rel="noopener noreferrer".
   - src/lib/labels.ts: cập nhật CAMPAIGN_SOURCE_LABELS theo enum mới (AMBASSADOR: "Ambassador",
     MANUAL: "Tạo tay", INTERNAL: "Nội bộ"); thêm hàm stripHtml() dùng chung cho việc hiển thị
     descHtml an toàn.
   - src/lib/authz.ts: thêm canClaimCampaign(user, campaign) = chưa có mmId và role là CFO/MM.
   - KHÔNG làm (đã cân nhắc kỹ và loại bỏ chủ động — đừng tự thêm lại): bảng brands/
     brand_aliases/platforms riêng, cơ chế "adopt" tách khỏi việc set mmId, bảng lưu lịch sử
     thay đổi từng field, cơ chế alias khớp dữ liệu lịch sử có hiệu lực theo thời gian, cảnh báo
     insights riêng cho sync (bảng insights chưa tồn tại, thuộc Module 6).

5. Coolify: không test được cron thật ở máy dev — chỉ ghi vào README cách cấu hình Scheduled
   Task (lệnh npm run sync:ambassador, lịch 1 lần/ngày) để làm khi deploy.

Vào Plan Mode trình kế hoạch chờ tôi duyệt mới code (dù thiết kế đã chốt, vẫn theo đúng nguyên
tắc dự án — có thể plan sẽ ngắn vì phần khó đã giải quyết xong). Sau khi duyệt, verify:
- npx prisma migrate dev chạy sạch, npm run build qua typecheck.
- Chạy npm run sync:ambassador THẬT (gọi API Ambassador thật) → xem DB có campaign mới,
  external_key đúng định dạng, mmId NULL. Chạy lại lần 2 → không tạo trùng.
- Browser: /campaigns (CFO) → thấy campaign đồng bộ, lọc "Chưa nhận" đúng; vào chi tiết, bấm
  "Nhận" bằng tài khoản MM → mmId được set, campaign chuyển sang "Của tôi" và sửa được.
- Tạo 1 campaign tay (không qua sync) → chạy sync lại → xác nhận không bị đụng vào.
Xong thì cập nhật "Trạng thái hiện tại" trong docs/PROJECT_EPS.md.
```

## Module 3 — Lương & thưởng MM (✅ đã code)

> **Điều kiện bắt buộc trước khi dán prompt này** (đã kiểm tra 2026-07-22: `eps-platform/data/`
> mới chỉ có "Hồ sơ Talent.xlsx", CHƯA có 3 file dưới) — export rồi bỏ vào `eps-platform/data/`:
> - Cơ chế tính thưởng + lợi nhuận MM: https://docs.google.com/spreadsheets/d/15UZdH4fJeb_fs0v8XGTD0Lxhj6I2ThKQwC_CbcU5DDk/edit?gid=580753235#gid=580753235
> - Report lương MM Giang: https://docs.google.com/spreadsheets/d/1_NiE3qPLGJcWCqnYa8e1ev95C0LXK3FPOtbl7r7m9gg/edit?gid=891075856#gid=891075856
> - Report lương MM Hà: https://docs.google.com/spreadsheets/d/1iJzSi52lQ0VahKQ_hp5IAZh40bYgOwFd-3euHEeRIR8/edit?gid=1365585835#gid=1365585835
>
> Không có 3 file này, chat mới sẽ phải đoán công thức — đừng để nó đoán, dừng lại export trước.

```
Đọc docs/PROJECT_EPS.md, docs/DB_SCHEMA.md (nhóm 6) và eps-platform/README.md trước khi làm gì.
Đọc code thật để biết chính xác Module 2 đã có gì: eps-platform/prisma/schema.prisma (model
Video, Campaign), eps-platform/src/lib/authz.ts, eps-platform/src/lib/labels.ts.

Triển khai Module 3 — Lương & thưởng cho eps-platform. Bối cảnh hiện tại (đã xác nhận thật,
không phải giả định — Module 2 đã code xong, DB đang có 14 campaign + 317 video thật từ import
lịch sử):
- Video.productionCost (Int, VND) đã có sẵn trên từng video — đây là chi phí sản xuất, dùng
  thẳng cho phần "lợi nhuận MM", không cần thêm cột.
- Ai nộp video lên ScaleF là TECH (videos.scalefSubmittedById/At), MM chỉ xác nhận đối soát
  (scalefConfirmedById/At) — KHÁC bản ghi cũ trong DB_SCHEMA.md (từng ghi nhầm là MM nộp), đã
  sửa. Khi tính thưởng theo view/post ScaleF, nhớ đây là bước sẽ nối vào Module 4 (đồng bộ
  ScaleF) sau — Module 3 này CHƯA có dữ liệu view/thưởng ScaleF thật, chỉ tính phần lương MM
  dựa trên video log + cơ chế (không phụ thuộc Module 4).
- Campaign.contractValue (giá trị booking) đã có — có thể liên quan tới lợi nhuận nếu cơ chế
  thật dùng tới, đọc file cơ chế để xác nhận có dùng hay không, đừng tự suy diễn.

Việc cần làm:
- Migrate nhóm bảng 6 theo DB_SCHEMA.md: reward_policies (JSONB, có hiệu lực theo thời gian —
  applies_to MM|TALENT, effective_from/to), payroll_periods (theo tháng, trạng thái DRAFT→
  APPROVED→PAID), payroll_items (breakdown JSONB để đối soát từng khoản).
- Đọc 3 file trong eps-platform/data/ (cơ chế + 2 report MM) để model ĐÚNG công thức thật —
  không suy đoán, không bịa công thức "hợp lý". Nếu thấy công thức không rõ ràng hoặc file thiếu
  cột cần thiết, DỪNG LẠI hỏi tôi, đừng tự chọn 1 cách hiểu rồi code luôn.
- Luồng: CFO tạo kỳ lương tháng → hệ thống tính nháp từ dữ liệu (video.productionCost + cơ chế
  đọc được) → CFO duyệt → đánh dấu đã trả. Đối chiếu số tính ra với report lương MM Giang/Hà cũ
  (2 file trong data/) — lệch thì báo lệch bao nhiêu %, đừng tự "làm tròn cho khớp".
- Phân quyền: chỉ CFO tạo/duyệt kỳ lương. MM xem được lương của chính mình (breakdown chi tiết
  để tự đối chiếu), không xem được lương MM khác. TECH không liên quan module này.
- Vào Plan Mode trình kế hoạch — BẮT BUỘC trình bày lại cách bạn hiểu công thức thưởng sau khi
  đọc file (viết ra thành công thức rõ ràng, có ví dụ số cụ thể từ 1 dòng report thật) để tôi xác
  nhận đúng/sai TRƯỚC khi duyệt kế hoạch. Chờ duyệt mới code.
- Xong thì verify: browser (tạo kỳ lương mẫu, so số với report cũ), npm run build, cập nhật
  docs/PROJECT_EPS.md + README.
```

## Bổ sung Module 2/3 — Chi phí video: bắt buộc điền, điền nhanh, khóa sau khi CFO chốt lương

```
Đọc docs/PROJECT_EPS.md, docs/DB_SCHEMA.md và eps-platform/README.md trước khi làm gì. Đọc code
thật: eps-platform/src/app/(dashboard)/videos/[id]/page.tsx và videos/new/page.tsx (2 chỗ MM nhập
productionCost hiện có), eps-platform/src/server/actions/videos.ts (createVideos/updateVideo),
eps-platform/src/server/payroll/compute.ts (hàm monthRange + query `airDate: { gte: start, lt: end
}` — ĐÂY LÀ CÁCH DUY NHẤT video được gắn với 1 kỳ lương: KHÔNG có cột FK video→payroll_period nào
cả, payroll chỉ quét lại video theo khoảng ngày mỗi lần tính).

Bối cảnh đã xác nhận với CFO (2026-07-22):
- Chi phí sản xuất phụ thuộc CAMPAIGN, không phụ thuộc từng Talent (đối chiếu 2 file report lương
  thật: cùng MM, cùng campaign → mọi Talent cùng đơn giá/video, chỉ khác số lượng video). Vì vậy
  CFO muốn giảm phụ thuộc vào số mặc định `Talent.productionFeePerVideo` — số này CHỈ nên là gợi ý
  khởi điểm, MM luôn phải tự xác nhận/điền số thật theo từng video/từng campaign, không dựa mãi
  vào fallback im lặng.
- `Talent.productionFeePerVideo` đã được backfill bằng số thật từ report (2026-07-22, xem
  scripts/backfill-production-fees.ts để biết nguồn từng số — ĐỪNG chạy lại script này, chỉ đọc
  để hiểu ngữ cảnh). Việc hôm nay là UX, không phải data nữa.
- MM tự điền chi phí riêng cho từng video khi nộp/sửa đã hoạt động đúng (videos/new + videos/[id]),
  KHÔNG cần sửa field hay logic đã có — chỉ bổ sung các phần dưới đây.

Triển khai — 3 phần:

### 1. Bắt buộc điền khi thiếu (thay vì âm thầm fallback về 0/mặc định)
- Video có `productionCost` chưa được MM XÁC NHẬN (tạm coi = 0, vì hiện tại 0 luôn có nghĩa "chưa
  điền" trong toàn bộ dữ liệu thật — nếu lo trường hợp video thật sự miễn phí cần phân biệt với
  "chưa điền", cân nhắc hỏi CFO có cần đổi cột sang nullable không, đừng tự quyết) phải hiện CẢNH
  BÁO rõ ràng: badge/banner trên trang video, trên danh sách, và trên trang chi tiết kỳ lương nếu
  kỳ đó có video thiếu chi phí.
- CFO KHÔNG duyệt được kỳ lương (chuyển DRAFT→APPROVED) nếu còn video trong tháng đó có
  productionCost = 0 — chặn ở server action approve, không chỉ ẩn nút. Thông báo rõ còn bao nhiêu
  video thiếu, link thẳng tới danh sách đó (dùng filter ở mục 2).

### 2. Filter "chưa có chi phí" trong danh sách video (/videos)
- Thêm filter/chip lọc video có productionCost = 0, tách biệt filter "chưa gửi ScaleF" đã có.
  MM thấy filter này áp theo Talent mình quản lý (dùng videoScopeWhere có sẵn).

### 3. Điền nhanh chi phí (bulk)
- MM cần cách điền nhiều video cùng lúc thay vì mở từng video một. Gợi ý (Plan Mode tự chọn cách
  hợp lý, tham khảo UX bulk-submit đã có ở videos/new — mỗi dòng 1 link dùng chung Talent/campaign):
  ở màn danh sách lọc "chưa có chi phí", cho chọn nhiều video (checkbox) + 1 ô nhập giá + nút "Áp
  dụng cho các video đã chọn", hoặc nhóm theo Talent+Campaign+tháng (vì cùng nhóm này gần như luôn
  cùng giá theo dữ liệu thật) với 1 ô nhập áp dụng cho cả nhóm.
- Server action mới (bulk update productionCost) — vẫn phải tôn trọng khóa kỳ lương ở mục 4 dưới,
  và ghi audit_logs cho lần sửa hàng loạt (1 dòng tổng hợp, không cần 1 dòng/video).

### 4. Khóa sửa sau khi CFO chốt kỳ lương (giữ nguyên yêu cầu gốc)
- Thêm hàm kiểm tra video có "bị khóa" không: tìm PayrollPeriod có status IN (APPROVED, PAID) mà
  video.airDate nằm trong khoảng tháng đó (dùng lại monthRange từ compute.ts). Áp dụng cho cả
  updateVideo VÀ createVideos (video mới tạo với airDate lùi vào tháng đã chốt cũng phải chặn).
- CFO luôn sửa được; MM bị chặn productionCost/airDate/campaignId khi video thuộc kỳ đã khóa, hiện
  rõ lý do ("Kỳ lương tháng X đã được duyệt, liên hệ CFO nếu cần sửa").
- CFO cần cách "mở lại" kỳ lương (APPROVED→DRAFT) khi thật sự cần sửa — thêm vào
  src/server/actions/payroll.ts nếu chưa có, ghi audit_logs (hành động nhạy cảm). KHÔNG tự tính
  lại payroll_items khi mở lại — CFO bấm tính lại (nút có sẵn) sau khi sửa xong.

Vào Plan Mode trình kế hoạch chờ tôi duyệt mới code. Xong verify browser: filter "chưa có chi phí"
ra đúng danh sách; điền nhanh cho nhiều video cùng lúc; CFO không duyệt được kỳ lương còn video
thiếu chi phí; sau khi duyệt, MM sửa video tháng đó bị chặn; CFO mở lại kỳ → sửa được lại;
npm run build, cập nhật docs/PROJECT_EPS.md + README.
```

## Module 4 — Đồng bộ ScaleF (API-first, scraper dự phòng) (✅ đã code, PR #1)

```
Đọc docs/PROJECT_EPS.md, docs/DB_SCHEMA.md (nhóm 5) và eps-platform/README.md trước khi làm gì.
Đọc code thật: eps-platform/prisma/schema.prisma (model Talent — đã có scalefUsername/
scalefHashtag; model Video — đã có scalefSubmittedById/At do TECH nộp, scalefConfirmedById/At do
MM xác nhận), eps-platform/scripts/seed-reward-policies.ts (dòng có avgViewsPerVideo: 80000 —
đây là SỐ GIẢ ĐỊNH công thức lương Module 3 đang dùng tạm vì chưa có view thật).

Triển khai Module 4 — Đồng bộ dữ liệu ScaleF cho eps-platform:
- QUAN TRỌNG: ưu tiên API, KHÔNG vội làm scraper. Máy đã có sẵn:
  - Package Python accesstrade_scalef (scalef_client.py — gọi conversion-api.scalef.com, giải mã
    AES kiểu Laravel). Tìm trong thư mục output của phiên local-agent cũ (dò
    `find ~/Library/Application\ Support/Claude -name scalef_client.py`), hoặc xem
    ~/Claude/Scheduled/accesstrade-daily-digest/SKILL.md + daily_digest.py để thấy cách gọi mẫu.
  - ~/Claude/scalef-dashboard/ — Cloudflare Pages proxy đọc read-only, có sẵn 4 header cần thiết
    (X-Network-Id, X-At-User, X-At-User-Type, X-At-User-Access-Token).
  - ambassador.scalef.com/event — trang ADMIN (khác ambassador.koc.com.vn là public), BẮT BUỘC
    đăng nhập. Bundle JS lộ ra các nhóm event/event-reward/event-reward-milestone/
    event-reward-statistic — nhiều khả năng đây là nơi có dữ liệu view/thưởng theo mốc thật, đáng
    xác minh trước khi kết luận API cũ đủ hay không. TUYỆT ĐỐI dùng service account riêng (CFO
    cấp qua .env), KHÔNG dùng tài khoản cá nhân ai đó gửi qua chat — nếu tôi lỡ đưa credentials cá
    nhân trong chat, nhắc tôi đổi mật khẩu, không dùng để tự động hóa.
  - Xác minh API lấy được: video đã duyệt, view hàng ngày, thưởng theo view/post của KOC. Đối
    chiếu bằng talents.scalef_hashtag (khóa khớp KOC) VÀ videos.scalef_submitted_at IS NOT NULL
    (chỉ video Tech đã thật sự nộp mới có khả năng xuất hiện trên ScaleF — đừng tìm video chưa
    nộp, sẽ không thấy và dễ hiểu nhầm là API thiếu dữ liệu).
- Nếu API đủ dữ liệu → worker đồng bộ định kỳ (cron) ghi vào nhóm bảng 5 DB_SCHEMA.md:
  scalef_videos (khóa scalef_key, video_id nullable — có màn ghép tay khi chưa khớp được),
  scalef_daily_stats (snapshot theo ngày, CHỈ THÊM không sửa — để tính tăng trưởng view theo
  thời gian), scrape_runs (log mỗi lần chạy, ok/error, hiện cho Tech). Nếu API không đủ (thiếu
  view hàng ngày hoặc thưởng theo mốc) → dừng lại trình bày rõ thiếu gì, bàn phương án Playwright
  cho đúng phần thiếu đó, đừng tự quyết làm scraper toàn bộ.
- Credentials để trong .env, không hardcode, không commit (nhắc lại: service account riêng, xem
  mục trên).
- Màn hình: log các lần đồng bộ cho Tech (`/scalef` hoặc gộp vào trang có sẵn phù hợp) + màn ghép
  tay video ScaleF chưa khớp video nội bộ (video_id null trong scalef_videos).
- Lưu ý dữ liệu: 3 hashtag đang bị trùng giữa 2 người thật (đã tự truy vấn xác nhận 2026-07-22,
  6 Talent bị ảnh hưởng):
  - #m2kkthm: "@capnhatthitruong247" (MM Nga) và "Phương" (MM Hà)
  - #rqyd1vy: "@tbducc1012" (MM Đức) và "Ngọc Thư" (MM Giang)
  - #pj1dnf6: "@dodoccrew" (MM Đức) và "Thuý Hiền" (MM Giang)
  Khi khớp dữ liệu ScaleF gặp 1 trong 3 hashtag này, cảnh báo rõ ràng (không tự chọn 1 trong 2
  người) — hiện ở màn ghép tay để CFO/Tech xử lý thủ công.
- SAU KHI đồng bộ chạy ổn và có dữ liệu view thật đối chiếu được với avgViewsPerVideo=80000: chỉ
  BÁO CÁO chênh lệch (view thật vs giả định, theo Talent/tháng), KHÔNG tự động thay avgViewsPerVideo
  bằng số thật hay sửa lại reward_policies — việc này ảnh hưởng ngược tới lương đã tính ở Module 3,
  phải hỏi tôi quyết định riêng, không tự làm trong module này.
- Vào Plan Mode trình kế hoạch chờ tôi duyệt mới code. Xong verify (chạy đồng bộ thật 1 lần, xem
  số liệu vào DB, số Talent khớp được/chưa khớp được), npm run build, cập nhật docs/PROJECT_EPS.md
  + README.
```

## Module 5 — Dealverse (affiliate link theo Talent) (✅ đã code)

```
Đọc docs/PROJECT_EPS.md, docs/DB_SCHEMA.md (nhóm 7) và eps-platform/README.md trước khi làm gì.

Bối cảnh đã xác minh THẬT (đã mở dealverse.pages.dev trực tiếp 2026-07-22, không phải giả định):
- dealverse.pages.dev là trang deal/voucher công khai CÓ THẬT, đang chạy (Cloudflare Pages, lúc
  kiểm tra có 22 deal, 516 lượt lấy). Đây là nền tảng Talent sẽ quảng bá qua bio kênh social —
  KHÔNG phải hệ thống nội bộ EPS, không cần tích hợp API gì với nó.
- Mỗi thẻ deal trên trang đó đã tự có tracking riêng của họ (link qua shorten.asia kèm
  sub1/sub2) — đó là tracking NỘI BỘ của DealVerse cho từng deal, KHÔNG liên quan và KHÔNG cần
  phối hợp với tracking của EPS. EPS chỉ cần 1 lớp redirect độc lập phía trước: ghi nhận Talent
  nào đưa traffic tới, không cần DealVerse "biết" hay hỗ trợ gì thêm. target_url mặc định là
  trang chủ dealverse.pages.dev, để cột riêng cho CFO đổi sau nếu muốn trỏ trang cụ thể hơn.
- LƯU Ý TRÁNH NHẦM LẪN: đây là "affiliate link" quảng bá DealVerse qua bio — KHÁC HẲN
  talents.referredById (Module 3, thưởng tuyển dụng — ai giới thiệu Talent này VÀO CÔNG TY).
  Cùng chữ "referral/giới thiệu" nhưng 2 khái niệm không liên quan, đừng gộp chung.

Triển khai Module 5 — Dealverse affiliate link cho eps-platform:
- Migrate nhóm bảng 7 theo DB_SCHEMA.md: affiliate_links (slug duy nhất, target_url default =
  dealverse.pages.dev), link_clicks, link_conversions (dự phòng, chưa chắc DealVerse trả được
  dữ liệu chuyển đổi — để trống nếu chưa xác minh được, đừng bịa nguồn dữ liệu).
- Redirect nội bộ /go/<slug>: ghi 1 dòng click (thời điểm, referrer, nguồn parse từ
  referrer/UTM, user_agent, ip đã hash) rồi 302 tới target_url. Route này CÔNG KHAI, KHÔNG qua
  proxy.ts (route public không đăng nhập, xem cách proxy.ts hiện tại loại trừ /api/auth để làm
  tương tự cho /go), phải nhanh (ghi log không được chặn redirect — cân nhắc ghi async/best-effort,
  KHÔNG để lỗi ghi log làm hỏng redirect).
- Tự động tạo link cho Talent mới khi thêm hồ sơ (hook vào chỗ tạo Talent đã có,
  src/server/actions/talents.ts); nút tạo/tắt link trong trang chi tiết Talent.
- Màn hình cho CFO: bảng performance click theo Talent, theo nguồn, theo thời gian. MM xem được
  click của Talent mình quản lý (dùng talentScopeWhere đã có, đừng viết lại logic phân quyền mới).
- Sheet "AFF" trong eps-platform/data/Hồ sơ Talent.xlsx có dữ liệu mẫu/địa chỉ liên quan —
  đọc tham khảo, hỏi tôi trước khi import gì từ đó.
- Vào Plan Mode trình kế hoạch chờ tôi duyệt mới code. Xong verify browser (bấm link thật /go/xxx,
  xác nhận redirect đúng tới dealverse.pages.dev VÀ click được ghi vào DB), npm run build,
  cập nhật docs/PROJECT_EPS.md + README.
```

## Module 6 — Dashboard thông minh + Insight theo role

```
Đọc docs/PROJECT_EPS.md, docs/DB_SCHEMA.md (nhóm 8) và eps-platform/README.md trước khi làm gì.
Đọc code thật: eps-platform/prisma/schema.prisma (model ScalefVideo — CHÚ Ý: không có cột
talentId trực tiếp, chỉ nối được tới Talent QUA videoId khi đã ghép tay ở /scalef).

Bối cảnh dữ liệu thật đã xác nhận (2026-07-22, không phải giả định):
- `scalef_videos`: 145 dòng, NHƯNG 0/145 đã ghép được video_id (chưa ai làm ở /scalef) — nghĩa
  là KHÔNG có cách nào tính "doanh thu/view thật theo Talent hay theo campaign" lúc này, vì
  ScalefVideo chỉ nối được sang Talent thông qua Video.talentId sau khi ghép tay. Dashboard PHẢI
  hiện rõ trạng thái này (VD "Chưa ghép được dữ liệu ScaleF cho Talent nào — vào /scalef để ghép
  tay") thay vì im lặng hiện số 0 hoặc bỏ qua — đừng để CFO tưởng nhầm doanh thu ScaleF = 0 thật.
- `videos.production_cost` = 0 cho TOÀN BỘ 317 video hiện có (talents.production_fee_per_video
  cũng = 0 cho cả 20 Talent — chưa backfill từ Excel thật). Mọi số "lợi nhuận" tính từ dữ liệu
  hiện tại sẽ SAI (chi phí giả định = 0). Dashboard phải hiện cảnh báo rõ ràng ở phần lợi
  nhuận/chi phí (banner hoặc badge, không chỉ ẩn trong tooltip) khi phát hiện phần lớn video có
  production_cost = 0, đừng vẽ biểu đồ "lợi nhuận" đẹp mà thật ra vô nghĩa. Cân nhắc hỏi tôi
  trước: có nên backfill production_fee_per_video từ data/Hồ sơ Talent.xlsx TRƯỚC khi làm dashboard
  không (số liệu profit sẽ vô nghĩa cho tới khi backfill xong)?
- Payroll (Module 3) đã có dữ liệu thật để tham khảo cho phần "chi phí lương" (1 kỳ lương,
  payroll_items) — dùng số đã tính sẵn đó thay vì tính lại công thức lương trong Module 6.
- Đã có sẵn màn "/scalef" (log đồng bộ + ghép tay) và authz helpers dạng *ScopeWhere/can* —
  tái dùng, đừng viết lại phân quyền hay dựng lại màn log đồng bộ.

Triển khai Module 6 — Dashboard + insight tự động cho eps-platform:
- Migrate phần còn lại nhóm bảng 8 theo DB_SCHEMA.md: expenses, insights (audit_logs đã có
  từ module 1).
- Dashboard theo role bằng Recharts:
  - CFO/COO: doanh thu (contract_value campaign + ScaleF thật CHỈ khi đã ghép được, ghi rõ % đã
    ghép), chi phí (production_cost + expenses ads/lương + payroll_items), lợi nhuận (kèm cảnh
    báo độ tin cậy nếu production_cost phần lớn = 0), tăng trưởng theo tháng, top Talent/campaign.
  - MM: hiệu suất team mình, video chậm tiến độ (tính từ video_pipeline_events).
  - Tech: trạng thái pipeline, tình trạng đồng bộ ScaleF (link/nhúng từ /scalef có sẵn, không
    làm trùng).
- Insight rule-based chạy định kỳ, ghi vào bảng insights, lọc hiển thị theo role. Ngưỡng đề
  xuất (tôi sẽ chỉnh khi duyệt plan): video quá 48h chưa qua bước pipeline tiếp theo; view
  giảm >30% so với trung bình 7 ngày (CHỈ tính được cho video đã ghép ScaleF); đồng bộ ScaleF
  fail (đọc scrape_runs có sẵn); Talent 14 ngày không có video mới.
- Form nhập expenses cho Tech/CFO (chi phí ads gắn campaign/video).
- Vào Plan Mode trình kế hoạch chờ tôi duyệt mới code. Xong verify browser cả 3 role,
  npm run build, cập nhật docs/PROJECT_EPS.md + README.
```

## Sau cùng — Deploy VPS (khi 2–3 module chạy ổn)

```
Đọc docs/PROJECT_EPS.md và eps-platform/README.md. Hướng dẫn tôi deploy eps-platform lên VPS
bằng Coolify theo đúng stack đã chốt: chuẩn bị Dockerfile/compose, Postgres + backup tự động
hàng ngày đẩy lên object storage, biến môi trường, HTTPS, và checklist bảo mật (đổi mật khẩu
seed, AUTH_SECRET mới, khóa cổng DB). Tôi chưa mua VPS — tư vấn cấu hình/giá trước, chờ tôi
chốt rồi làm từng bước cùng tôi.
```
