import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CAMPAIGN_SOURCE_LABELS, CAMPAIGN_STATUS_LABELS } from "@/lib/labels";
import type { Campaign } from "@/generated/prisma/client";

type ManagerOption = { id: string; fullName: string };

// Form dùng chung cho tạo mới và sửa campaign — server component thuần, select dùng thẻ HTML
// native, đồng bộ với src/components/talent-form.tsx.
export function CampaignForm({
  action,
  campaign,
  managers,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  campaign?: Campaign | null;
  managers: ManagerOption[];
  submitLabel: string;
}) {
  return (
    <form action={action} className="grid max-w-2xl gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Tên campaign *</Label>
        <Input
          id="name"
          name="name"
          required
          defaultValue={campaign?.name ?? ""}
          placeholder="VD: Cùng Katinat hoà nhịp World Cup 2026"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="brandName">Nhãn hàng *</Label>
          <Input
            id="brandName"
            name="brandName"
            required
            defaultValue={campaign?.brandName ?? ""}
            placeholder="VD: KATINAT"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="source">Nguồn</Label>
          <select
            id="source"
            name="source"
            defaultValue={campaign?.source ?? "MANUAL"}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          >
            {Object.entries(CAMPAIGN_SOURCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="status">Trạng thái</Label>
          <select
            id="status"
            name="status"
            defaultValue={campaign?.status ?? "NEW"}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          >
            {Object.entries(CAMPAIGN_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {!campaign ? (
          <div className="grid gap-2">
            <Label htmlFor="mmId">MM phụ trách *</Label>
            <select
              id="mmId"
              name="mmId"
              required
              defaultValue={managers[0]?.id ?? ""}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
            >
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Thêm MM thứ 2 trở đi ở mục &quot;MM phụ trách&quot; sau khi tạo xong.
            </p>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="startDate">Ngày bắt đầu</Label>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={campaign?.startDate ? campaign.startDate.toISOString().slice(0, 10) : ""}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="endDate">Ngày kết thúc</Label>
          <Input
            id="endDate"
            name="endDate"
            type="date"
            defaultValue={campaign?.endDate ? campaign.endDate.toISOString().slice(0, 10) : ""}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="brief">Nội dung brief</Label>
        <Textarea
          id="brief"
          name="brief"
          rows={8}
          defaultValue={campaign?.brief ?? ""}
          placeholder="Thể lệ, định hướng nội dung, hashtag bắt buộc..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="sourceUrl">Link thể lệ gốc</Label>
          <Input
            id="sourceUrl"
            name="sourceUrl"
            type="url"
            defaultValue={campaign?.sourceUrl ?? ""}
            placeholder="https://ambassador.koc.com.vn/..."
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="contractValue">Giá trị booking (VND)</Label>
          <Input
            id="contractValue"
            name="contractValue"
            type="number"
            min={0}
            step={1000}
            defaultValue={campaign?.contractValue ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="notes">Ghi chú</Label>
        <Textarea id="notes" name="notes" rows={2} defaultValue={campaign?.notes ?? ""} />
      </div>

      <div>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
