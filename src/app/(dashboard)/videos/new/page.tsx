import { prisma } from "@/lib/prisma";
import { requireRole, talentScopeWhere } from "@/lib/authz";
import { createVideos } from "@/server/actions/videos";
import { formatVnd } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default async function NewVideoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; talent?: string; campaign?: string }>;
}) {
  const user = await requireRole("CFO", "TECH", "MM");
  const { error, talent: presetTalent, campaign: presetCampaign } = await searchParams;

  // MM chỉ log được cho Talent mình quản lý.
  const [talents, campaigns] = await Promise.all([
    prisma.talent.findMany({
      where: { ...talentScopeWhere(user), status: "ACTIVE" },
      select: { id: true, fullName: true, productionFeePerVideo: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.campaign.findMany({
      where: user.role === "MM" ? { mmId: user.id } : {},
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Log video air</h1>
        <p className="text-sm text-muted-foreground">
          Dán nhiều link cùng lúc — mỗi dòng 1 link. Tất cả link trong lần nộp này dùng chung
          Talent, campaign và ngày air. Nền tảng tự nhận theo link.
        </p>
      </div>

      {error ? (
        <p className="max-w-2xl rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {talents.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Bạn chưa quản lý Talent nào đang hoạt động — thêm Talent trước khi log video.
        </p>
      ) : (
        <form action={createVideos} className="grid max-w-2xl gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="talentId">Talent *</Label>
              <select
                id="talentId"
                name="talentId"
                required
                defaultValue={presetTalent ?? ""}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
              >
                {talents.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName} — mặc định {formatVnd(t.productionFeePerVideo)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="airDate">Ngày air *</Label>
              <Input id="airDate" name="airDate" type="date" required defaultValue={today} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="campaignId">Campaign</Label>
              <select
                id="campaignId"
                name="campaignId"
                defaultValue={presetCampaign ?? ""}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
              >
                <option value="">(Không thuộc campaign nào)</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="productionCost">Chi phí sản xuất / video (VND) *</Label>
              <Input
                id="productionCost"
                name="productionCost"
                type="number"
                min={0}
                step={1000}
                required
                placeholder="Xem giá mặc định của Talent ở ô bên trái, tự xác nhận/sửa số thật"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="links">Link video air * (mỗi dòng 1 link)</Label>
            <Textarea
              id="links"
              name="links"
              rows={10}
              required
              placeholder={"https://www.tiktok.com/@handle/video/123\nhttps://www.facebook.com/share/v/abc/"}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Link đã có trong hệ thống sẽ tự động bỏ qua, dán lại cả danh sách cũng không tạo trùng.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="briefComment">Brief comment mong muốn</Label>
            <Textarea
              id="briefComment"
              name="briefComment"
              rows={3}
              placeholder="Nội dung/hướng comment muốn Talent triển khai cho loạt video này"
            />
          </div>

          <div>
            <Button type="submit">Log video</Button>
          </div>
        </form>
      )}
    </div>
  );
}
