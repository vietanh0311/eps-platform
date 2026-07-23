// Đồng bộ Campaign Ambassador — chạy tay: npm run sync:ambassador. Dự kiến chạy 1 lần/ngày qua
// Coolify Scheduled Task khi deploy. Nút "Đồng bộ ngay" trên /campaigns gọi chung 1 hàm
// syncAmbassadorCampaigns() (server action, xem src/server/actions/campaigns.ts).
import "dotenv/config";
import { syncAmbassadorCampaigns } from "../src/server/ambassador/sync";

async function main() {
  const result = await syncAmbassadorCampaigns("CRON");
  if (result.ok) {
    console.log(`[ambassador:sync] OK — ${result.itemsFound} campaign.`);
  } else {
    console.error(`[ambassador:sync] LỖI — ${result.error ?? "không rõ nguyên nhân"}`);
    process.exitCode = 1;
  }
}

main();
