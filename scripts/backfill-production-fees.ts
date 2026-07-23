// Backfill Talent.productionFeePerVideo — toàn bộ 20 Talent đang là 0 (chưa từng có trong Excel
// hồ sơ Talent gốc). Nguồn số liệu: 2 file report lương thật CFO gửi 2026-07-22
// ("[EPS X GIANG] Report tính lương 2026.xlsx", "[EPS] Thực tính MM Ha.xlsx"), đối chiếu các sheet
// theo tháng (Tháng 3-6/2026 cho Giang, Tháng 3-5/2026 + T8-12/2025 cho Hà).
//
// Đây CHỈ là số mặc định fallback — MM vẫn tự điền/sửa số thật theo từng video/từng campaign khi
// nộp (cơ chế đã có sẵn từ Module 2), số liệu thật cho thấy chi phí phụ thuộc campaign chứ không
// phụ thuộc từng Talent, nên các Talent cùng team dùng chung 1 số đại diện là hợp lý.
//
// Chạy 1 lần: npx tsx scripts/backfill-production-fees.ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

// [tên_talent, phí, nguồn]
const FEES: Array<[string, number, string]> = [
  // MM Giang — team dùng chung 1 mức trong file thật, hội tụ về 120.000đ/video từ T4/2026
  // ("Chi"/"Giang"/"Nhung"/"Ngân" đều cùng đơn giá mỗi campaign, xem sheet "tháng 4/5/6").
  ["Chi", 120_000, "Report Giang T4-6/2026 (đơn giá thật, đa số campaign)"],
  ["Giang", 120_000, "Report Giang T4-6/2026 (đơn giá thật, đa số campaign)"],
  ["Nhung", 120_000, "Report Giang T4-6/2026 (đơn giá thật, đa số campaign)"],
  ["Thư Ngân", 120_000, "Report Giang T4-6/2026, cột 'Ngân' — CFO xác nhận = Thư Ngân"],
  // Không có dòng riêng trong report — dùng chung mức team (cùng team, cùng campaign = cùng giá).
  ["Huờng", 120_000, "Không có dòng riêng trong report — theo mức chung team Giang"],
  ["Ngọc Thư", 120_000, "Không có dòng riêng trong report — theo mức chung team Giang"],
  ["Thuý Hiền", 120_000, "Không có dòng riêng trong report — theo mức chung team Giang"],
  ["Thuý Thẩm", 120_000, "Không có dòng riêng trong report — theo mức chung team Giang"],
  ["@thuyflinhxiu", 120_000, "Không có dòng riêng trong report — theo mức chung team Giang"],

  // MM Hà — Phương + Ly cùng campaign/tháng luôn cùng đơn giá, phổ biến nhất 100.000đ (T3-5/2026).
  ["Phương", 100_000, "Report Hà T3-5/2026 (đơn giá phổ biến nhất, dao động 100k-150k tùy campaign)"],
  ["Ly", 100_000, "Report Hà T3-5/2026 (cùng đơn giá campaign với Phương)"],
  // Phanh Têy = "Phương Anh" trong report (xác nhận qua sheet "Mẫu quản lý"), dữ liệu T8-12/2025,
  // dao động 80k/100k gần như đều nhau — CFO xác nhận hiện không còn làm video.
  ["Phanh Têy", 90_000, "Report Hà T8-12/2025 (tên thật 'Phương Anh'), trung bình 80k/100k — hiện không còn sản xuất"],

  // MM Đức + MM Nga — cả 2 MM đã nghỉ, không có report nào cho team này. Dùng mặc định chung công
  // ty (mức phổ biến nhất quan sát được ở cả 2 team còn lại, 2026) — KHÔNG phải số liệu thật riêng,
  // chỉ là fallback hợp lý.
  ["@beiucuaanhh73", 100_000, "Không có report (MM Đức đã nghỉ) — mặc định chung công ty"],
  ["@iamm.quynhanhh", 100_000, "Không có report (MM Đức đã nghỉ) — mặc định chung công ty"],
  ["@dodoccrew", 100_000, "Không có report (MM Đức đã nghỉ) — mặc định chung công ty"],
  ["@hocdotnhungannhieu", 100_000, "Không có report (MM Nga đã nghỉ) — mặc định chung công ty"],
  ["@hien_leecutii", 100_000, "Không có report (MM Đức đã nghỉ) — mặc định chung công ty"],
  ["@phiyenn04", 100_000, "Không có report (MM Đức đã nghỉ) — mặc định chung công ty"],
  ["@tbducc1012", 100_000, "Không có report (MM Đức đã nghỉ) — mặc định chung công ty"],
  ["@capnhatthitruong247", 100_000, "Không có report (MM Nga đã nghỉ) — mặc định chung công ty"],
];

async function main() {
  console.log(`Backfill ${FEES.length} Talent...\n`);
  let updated = 0;
  for (const [name, fee, source] of FEES) {
    const talent = await prisma.talent.findFirst({ where: { fullName: name } });
    if (!talent) {
      console.warn(`  [!] Không tìm thấy Talent "${name}" — bỏ qua.`);
      continue;
    }
    await prisma.talent.update({
      where: { id: talent.id },
      data: { productionFeePerVideo: fee },
    });
    console.log(`  ✓ ${name.padEnd(22)} → ${fee.toLocaleString("vi-VN")}đ   (${source})`);
    updated++;
  }
  console.log(`\nĐã cập nhật ${updated}/${FEES.length} Talent.`);
}

main().finally(() => prisma.$disconnect());
