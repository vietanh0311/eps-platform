// Chạy engine insight rule-based — chạy tay: npm run insights:run. Cũng là hàm cron/launchd sẽ
// gọi (nối tiếp sau scalef:sync trong scripts/scalef-sync-daily.sh khi cấu hình ở VPS) và nút
// "Chạy insight ngay" trên dashboard gọi chung (server action) — cùng 1 hàm runInsightRules().
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { runInsightRules } from "../src/server/insights/engine";

async function main() {
  const result = await runInsightRules();
  for (const note of result.notes) console.log(`[insights:run] ${note}`);
  if (result.ok) {
    console.log(`[insights:run] OK — tạo mới ${result.created}, đóng ${result.resolved}.`);
  } else {
    console.error(`[insights:run] LỖI — ${result.error ?? "không rõ nguyên nhân"}`);
    process.exitCode = 1;
  }
}

main().finally(() => prisma.$disconnect());
