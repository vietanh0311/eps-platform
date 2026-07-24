// Vấn đề 1 (2026-07-24) — đọc chính sách thưởng campaign đã có sẵn trong `scalef_events.raw`
// (Module 4 đã cào GET /events hàng ngày từ 2026-07-22, chỉ chưa ai dùng tới field `reward`),
// khớp với Campaign EPS theo brand_name (cùng brandsOverlap() dùng cho Vấn đề 3 — 1 brand có thể
// có nhiều event/campaign khác nhau, KHÔNG tự động khớp), và đề xuất `pricePerView` cho MM.
// CFO/Tech tự xem và quyết định Bỏ qua/Liên kết ở /campaigns/scalef-policy
// (src/server/actions/campaigns.ts) — không tự động áp dụng.
import { prisma } from "@/lib/prisma";
import { brandsOverlap } from "./matching";

export type RewardParseResult = {
  kind: "per_view" | "per_post" | "ambiguous" | "unparseable" | "empty";
  value: number | null;
  raw: string;
};

// Khảo sát thật 193/225 event có field reward (2026-07-24): 139 "đ/view" (kể cả lỗi chính tả
// "13d/view", viết hoa "15đ/View"), 10 "đ/post" (vd "120.000 VND/ 1 post"), 41 số trần không đơn
// vị (vd "15", "0" — KHÔNG tự đề xuất, quá mơ hồ dù đa số xung quanh là đ/view — CFO xác nhận qua
// Plan Mode), 2 rác không đọc được (vd "Gahahha"). VND không có phần thập phân trong dữ liệu thật
// nên coi mọi dấu "." hoặc "," trong số là dấu ngăn cách nghìn, bỏ hẳn khi parse.
export function parseScalefReward(raw: string | null | undefined): RewardParseResult {
  const s = (raw ?? "").trim();
  if (!s) return { kind: "empty", value: null, raw: s };

  const numMatch = s.match(/\d[\d.,]*/);
  const lower = s.toLowerCase();
  const hasView = lower.includes("view");
  const hasPost = lower.includes("post");

  if (!numMatch) return { kind: "unparseable", value: null, raw: s };

  const value = Number(numMatch[0].replace(/[.,]/g, ""));
  if (!Number.isFinite(value)) return { kind: "unparseable", value: null, raw: s };

  if (hasView) return { kind: "per_view", value, raw: s };
  if (hasPost) return { kind: "per_post", value, raw: s };
  return { kind: "ambiguous", value, raw: s };
}

type ScalefEventRaw = { partner?: { name?: string }; reward?: string };

export type ScalefPolicyCandidate = {
  campaign: {
    id: string;
    name: string;
    brandName: string;
    source: string;
    pricePerView: number | null;
  };
  event: {
    id: string;
    name: string;
    partnerName: string | null;
    status: string | null;
    startAt: Date | null;
    endAt: Date | null;
    reward: RewardParseResult;
  };
};

export async function findScalefPolicyCandidates(): Promise<ScalefPolicyCandidate[]> {
  const [campaigns, events, dismissed] = await Promise.all([
    prisma.campaign.findMany({
      where: { scalefEventId: null, mergedIntoId: null },
      select: { id: true, name: true, brandName: true, source: true, pricePerView: true },
    }),
    prisma.scalefEvent.findMany({ where: { campaign: null } }),
    prisma.auditLog.findMany({
      where: { action: "DISMISS", entity: "campaign_scalef_match" },
      select: { entityId: true },
    }),
  ]);
  const dismissedKeys = new Set(dismissed.map((d) => d.entityId));

  const results: ScalefPolicyCandidate[] = [];
  for (const c of campaigns) {
    for (const e of events) {
      const raw = e.raw as ScalefEventRaw | null;
      const partnerName = raw?.partner?.name ?? null;
      if (!partnerName || !brandsOverlap(c.brandName, partnerName)) continue;
      if (dismissedKeys.has(`${c.id}:${e.id}`)) continue;

      results.push({
        campaign: {
          id: c.id,
          name: c.name,
          brandName: c.brandName,
          source: c.source,
          pricePerView: c.pricePerView,
        },
        event: {
          id: e.id,
          name: e.name,
          partnerName,
          status: e.status,
          startAt: e.startAt,
          endAt: e.endAt,
          reward: parseScalefReward(raw?.reward),
        },
      });
    }
  }
  return results;
}
