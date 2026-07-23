"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSystemAdmin } from "@/lib/authz";
import { runInsightRules } from "@/server/insights/engine";

// Nút "Chạy insight ngay" trên dashboard — gọi chung 1 hàm với cron (scripts/run-insights.ts).
export async function runInsightsNow() {
  await requireSystemAdmin();

  const result = await runInsightRules();
  revalidatePath("/");

  const qs = result.ok
    ? `insightsCreated=${result.created}&insightsResolved=${result.resolved}`
    : `insightsError=${encodeURIComponent(result.error ?? "Chạy insight thất bại")}`;
  redirect(`/?${qs}`);
}
