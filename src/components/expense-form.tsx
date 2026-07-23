import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/labels";
import type { Expense } from "@/generated/prisma/client";

type CampaignOption = { id: string; name: string };

// Form dùng chung cho tạo mới và sửa chi phí — cùng phong cách với booking-deal-form.tsx. Video
// gắn qua link dán tay (server tự tìm theo videoUrl), không dùng <select> 317 dòng.
export function ExpenseForm({
  action,
  expense,
  campaigns,
  defaultVideoUrl,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  expense?: Expense | null;
  campaigns: CampaignOption[];
  defaultVideoUrl?: string;
  submitLabel: string;
}) {
  return (
    <form action={action} className="grid max-w-2xl gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="category">Loại chi phí *</Label>
          <select
            id="category"
            name="category"
            required
            defaultValue={expense?.category ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          >
            <option value="" disabled>
              -- Chọn loại --
            </option>
            {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="amount">Số tiền (VNĐ) *</Label>
          <Input id="amount" name="amount" required defaultValue={expense?.amount ?? ""} placeholder="VD: 1500000" />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="incurredAt">Ngày phát sinh *</Label>
        <Input
          id="incurredAt"
          name="incurredAt"
          type="date"
          required
          defaultValue={expense?.incurredAt ? expense.incurredAt.toISOString().slice(0, 10) : ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="campaignId">Campaign (nếu có)</Label>
        <select
          id="campaignId"
          name="campaignId"
          defaultValue={expense?.campaignId ?? ""}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
        >
          <option value="">-- Không gắn campaign --</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="videoUrl">Link video (nếu chi phí gắn 1 video cụ thể)</Label>
        <Input id="videoUrl" name="videoUrl" defaultValue={defaultVideoUrl ?? ""} placeholder="Dán đúng link video đã log trong hệ thống" />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="note">Ghi chú</Label>
        <Input id="note" name="note" defaultValue={expense?.note ?? ""} />
      </div>

      <Button type="submit" className="w-fit">
        {submitLabel}
      </Button>
    </form>
  );
}
