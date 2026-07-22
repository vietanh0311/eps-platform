import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TALENT_STATUS_LABELS } from "@/lib/labels";
import type { Talent } from "@/generated/prisma/client";

type ManagerOption = { id: string; fullName: string };

// Form dùng chung cho tạo mới và sửa Talent. Server component thuần —
// select dùng thẻ HTML native để giữ code đơn giản, dễ maintain.
export function TalentForm({
  action,
  talent,
  managers,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  talent?: Talent | null;
  managers: ManagerOption[];
  submitLabel: string;
}) {
  return (
    <form action={action} className="grid max-w-xl gap-4">
      <div className="grid gap-2">
        <Label htmlFor="fullName">Họ tên *</Label>
        <Input id="fullName" name="fullName" required defaultValue={talent?.fullName ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="phone">Số điện thoại</Label>
          <Input id="phone" name="phone" defaultValue={talent?.phone ?? ""} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="joinedAt">Ngày tham gia</Label>
          <Input
            id="joinedAt"
            name="joinedAt"
            type="date"
            defaultValue={talent?.joinedAt ? talent.joinedAt.toISOString().slice(0, 10) : ""}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="contentDirection">Định hướng nội dung</Label>
        <Input
          id="contentDirection"
          name="contentDirection"
          defaultValue={talent?.contentDirection ?? ""}
          placeholder="VD: review mỹ phẩm, lifestyle..."
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="status">Trạng thái</Label>
          <select
            id="status"
            name="status"
            defaultValue={talent?.status ?? "ACTIVE"}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          >
            {Object.entries(TALENT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="managerId">MM quản lý *</Label>
          <select
            id="managerId"
            name="managerId"
            required
            defaultValue={talent?.managerId ?? managers[0]?.id ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          >
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="productionFeePerVideo">Phí sản xuất / video (VND)</Label>
        <Input
          id="productionFeePerVideo"
          name="productionFeePerVideo"
          type="number"
          min={0}
          step={1000}
          defaultValue={talent?.productionFeePerVideo ?? 150000}
        />
      </div>
      <fieldset className="grid gap-4 rounded-md border p-4">
        <legend className="px-1 text-sm font-medium text-muted-foreground">
          Định danh ScaleF &amp; thanh toán
        </legend>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="scalefUsername">Tên người dùng ScaleF</Label>
            <Input
              id="scalefUsername"
              name="scalefUsername"
              defaultValue={talent?.scalefUsername ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="scalefHashtag">Hashtag cá nhân ScaleF</Label>
            <Input
              id="scalefHashtag"
              name="scalefHashtag"
              defaultValue={talent?.scalefHashtag ?? ""}
              placeholder="#abc123"
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="taxCode">MST / tài khoản nhận tiền</Label>
          <Input id="taxCode" name="taxCode" defaultValue={talent?.taxCode ?? ""} />
        </div>
        <p className="text-xs text-muted-foreground">
          Hashtag cá nhân là mã ScaleF dùng để gắn video/thưởng cho đúng KOC — cần khớp chính
          xác để đồng bộ dữ liệu ở module sau.
        </p>
      </fieldset>
      <div className="grid gap-2">
        <Label htmlFor="notes">Ghi chú</Label>
        <Textarea id="notes" name="notes" defaultValue={talent?.notes ?? ""} rows={3} />
      </div>
      <div>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
