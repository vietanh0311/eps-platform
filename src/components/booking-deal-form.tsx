import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BookingDeal } from "@/generated/prisma/client";

type UserOption = { id: string; fullName: string };
type TalentOption = { id: string; fullName: string };

// Form dùng chung cho tạo mới và sửa booking deal — cùng phong cách với campaign-form.tsx.
export function BookingDealForm({
  action,
  deal,
  managers,
  talents,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  deal?: BookingDeal | null;
  managers: UserOption[];
  talents: TalentOption[];
  submitLabel: string;
}) {
  return (
    <form action={action} className="grid max-w-2xl gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="brandName">Nhãn hàng *</Label>
          <Input id="brandName" name="brandName" required defaultValue={deal?.brandName ?? ""} placeholder="VD: Anodin" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="dealMonth">Tháng ghi nhận *</Label>
          <Input id="dealMonth" name="dealMonth" type="month" required defaultValue={deal?.dealMonth ?? ""} />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="castAmount">Giá trị deal (VNĐ) *</Label>
        <Input id="castAmount" name="castAmount" required defaultValue={deal?.castAmount ?? ""} placeholder="VD: 1500000" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="mmId">MM quản lý *</Label>
          <select
            id="mmId"
            name="mmId"
            required
            defaultValue={deal?.mmId ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          >
            <option value="" disabled>
              -- Chọn MM --
            </option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sellerId">Người bán deal (để trống = MM quản lý)</Label>
          <select
            id="sellerId"
            name="sellerId"
            defaultValue={deal?.sellerId ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          >
            <option value="">-- Giống MM quản lý --</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="talentId">Mẫu dùng cho deal (nếu đã xác định)</Label>
        <select
          id="talentId"
          name="talentId"
          defaultValue={deal?.talentId ?? ""}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
        >
          <option value="">-- Chưa xác định --</option>
          {talents.map((t) => (
            <option key={t.id} value={t.id}>
              {t.fullName}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="note">Ghi chú</Label>
        <Input id="note" name="note" defaultValue={deal?.note ?? ""} />
      </div>

      <Button type="submit" className="w-fit">
        {submitLabel}
      </Button>
    </form>
  );
}
