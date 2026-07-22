// Seed dữ liệu ban đầu: tài khoản CFO + dữ liệu mẫu để xem giao diện.
// Chạy: npm run db:seed
// Idempotent: chạy lại không tạo trùng.
import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const CFO_EMAIL = "cfo@eps.local";
const DEFAULT_PASSWORD = "doimatkhau123"; // đổi ngay sau lần đăng nhập đầu tiên

async function main() {
  const passwordHash = await hash(DEFAULT_PASSWORD, 12);

  const cfo = await prisma.user.upsert({
    where: { email: CFO_EMAIL },
    update: {},
    create: { email: CFO_EMAIL, passwordHash, fullName: "CFO EPS", role: "CFO" },
  });

  const mmGiang = await prisma.user.upsert({
    where: { email: "giang.mm@eps.local" },
    update: {},
    create: { email: "giang.mm@eps.local", passwordHash, fullName: "MM Giang", role: "MM" },
  });
  const mmHa = await prisma.user.upsert({
    where: { email: "ha.mm@eps.local" },
    update: {},
    create: { email: "ha.mm@eps.local", passwordHash, fullName: "MM Hà", role: "MM" },
  });
  await prisma.user.upsert({
    where: { email: "tech@eps.local" },
    update: {},
    create: { email: "tech@eps.local", passwordHash, fullName: "Team Công Nghệ", role: "TECH" },
  });

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
  console.log(`  CFO:  ${CFO_EMAIL} / ${DEFAULT_PASSWORD}`);
  console.log("  MM:   giang.mm@eps.local, ha.mm@eps.local (cùng mật khẩu)");
  console.log("  Tech: tech@eps.local (cùng mật khẩu)");
  console.log("=> Đổi mật khẩu ngay sau lần đăng nhập đầu tiên (CFO đổi cho từng người ở /admin/users).");
}

main().finally(() => prisma.$disconnect());
