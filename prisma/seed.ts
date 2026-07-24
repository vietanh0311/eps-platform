// Seed dữ liệu ban đầu: tài khoản CFO + dữ liệu mẫu để xem giao diện.
// Chạy: npm run db:seed
// Idempotent: chạy lại không tạo trùng.
import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { randomPassword } from "../scripts/lib/random-password";
import type { Role } from "../src/generated/prisma/enums";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const CFO_EMAIL = "cfo@eps.local";

// Tạo user nếu chưa tồn tại, mật khẩu ngẫu nhiên riêng — KHÔNG đổi gì nếu user đã có sẵn (idempotent),
// nên chỉ trả về mật khẩu vừa sinh khi thực sự tạo mới (user cũ giữ nguyên mật khẩu cũ, không biết được).
async function ensureUser(email: string, fullName: string, role: Role) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { user: existing, created: false, password: null as string | null };

  const password = randomPassword();
  const user = await prisma.user.create({
    data: { email, fullName, role, passwordHash: await hash(password, 12) },
  });
  return { user, created: true, password };
}

async function main() {
  const results = [
    await ensureUser(CFO_EMAIL, "CFO EPS", "CFO"),
    await ensureUser("giang.mm@eps.local", "MM Giang", "MM"),
    await ensureUser("ha.mm@eps.local", "MM Hà", "MM"),
    await ensureUser("tech@eps.local", "Team Công Nghệ", "TECH"),
  ];
  const [cfo, mmGiang, mmHa] = results.map((r) => r.user);

  // Talent mẫu — chỉ tạo khi DB chưa có Talent nào (tránh chèn lại sau khi đã import dữ liệu thật).
  const talentCount = await prisma.talent.count();
  const sampleTalents = talentCount > 0 ? [] : [
    {
      fullName: "Talent Mẫu A",
      managerId: mmGiang.id,
      contentDirection: "Review mỹ phẩm",
      productionFeePerVideo: 150000,
      channel: { platform: "TIKTOK" as const, handle: "@talentmau_a", url: "https://tiktok.com/@talentmau_a" },
    },
    {
      fullName: "Talent Mẫu B",
      managerId: mmHa.id,
      contentDirection: "Lifestyle",
      productionFeePerVideo: 200000,
      channel: { platform: "FACEBOOK" as const, handle: "Talent Mẫu B", url: "https://facebook.com/talentmau.b" },
    },
  ];

  for (const t of sampleTalents) {
    const existing = await prisma.talent.findFirst({ where: { fullName: t.fullName } });
    if (existing) continue;
    await prisma.talent.create({
      data: {
        fullName: t.fullName,
        managerId: t.managerId,
        contentDirection: t.contentDirection,
        productionFeePerVideo: t.productionFeePerVideo,
        joinedAt: new Date(),
        channels: { create: { ...t.channel, isPrimary: true } },
      },
    });
  }

  console.log("Seed xong.");
  const created = results.filter((r) => r.created);
  if (created.length === 0) {
    console.log("  Không có tài khoản mới — tất cả đã tồn tại từ trước, giữ nguyên mật khẩu cũ.");
  } else {
    console.log(`  Đã tạo ${created.length} tài khoản mới — gửi riêng mật khẩu cho từng người:`);
    for (const r of created) {
      console.log(`    ${r.user.email}  /  ${r.password}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
