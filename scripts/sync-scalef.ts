// Đồng bộ ScaleF — chạy tay: npm run scalef:sync. Cũng là hàm launchd (scripts/scalef-sync-daily.sh)
// gọi mỗi 30 phút và nút "Đồng bộ ngay" trên /scalef gọi chung (server action) — cùng 1 hàm syncScalef().
import "dotenv/config";
import { syncScalef } from "../src/server/scalef/sync";

async function main() {
  const result = await syncScalef();
  if (result.ok) {
    console.log(`[scalef:sync] OK — ${result.itemsFound} content.`);
  } else {
    console.error(`[scalef:sync] LỖI — ${result.error ?? "không rõ nguyên nhân"}`);
    process.exitCode = 1;
  }
}

main();
