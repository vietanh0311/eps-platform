// Import hồ sơ Talent từ file Excel "Hồ sơ Talent.xlsx" (export từ Google Sheets).
//
// Cách dùng:
//   Xem trước (không ghi DB):  npx tsx scripts/import-talents.ts "data/Hồ sơ Talent.xlsx"
//   Ghi thật:                  npx tsx scripts/import-talents.ts "data/Hồ sơ Talent.xlsx" --write
//
// Đọc sheet "Quản lý kênh + mẫu" (hồ sơ Talent + kênh). Các sheet khác trong file
// (air clip theo tháng, brief, report) là dữ liệu cho Module 2/3/6 — không đụng ở đây.
//
// Quy tắc:
//  - Mỗi KOC nhận diện bằng "Hashtag cá nhân ScaleF"; nhiều dòng cùng hashtag = 1 Talent nhiều kênh.
//  - Dòng không có hashtag => mỗi dòng là 1 Talent riêng.
//  - Tên Talent lấy theo thứ tự ưu tiên: cột Tên Talent -> Tên kênh -> @handle TikTok -> tên ScaleF.
//  - Manager (Giang/Hà/Đức/Nga...) map theo tên sang tài khoản MM; thiếu thì TẠO tài khoản MM mới
//    (chỉ khi --write; mật khẩu tạm in ra để CFO đổi sau).
import "dotenv/config";
import { readFileSync } from "node:fs";
import { hash } from "bcryptjs";
import * as XLSX from "xlsx";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { Platform } from "../src/generated/prisma/enums";

const SHEET = "Quản lý kênh + mẫu";
const DEFAULT_MM_PASSWORD = "doimatkhau123";

const COL = {
  tiktok: "Link Tiktok",
  scalefUser: "Tên người dùng hệ thống ScaleF (KOC Ambassador)",
  facebook: "Link Facebook",
  channelName: "Tên kênh",
  talentName: "Tên Talent",
  direction: "Định hướng kênh",
  hashtag: "Hashtag cá nhân hệ thống ScaleF (KOC Ambassador)",
  manager: "Manager phụ trách",
  status: "Trạng thái",
  taxCode: "MST (tài khoản nhận tiền)",
} as const;

type Row = Record<string, string>;

function tiktokHandle(url: string): string | null {
  const m = url.match(/tiktok\.com\/@([^/?#\s]+)/i);
  return m ? "@" + m[1] : null;
}

function mapStatus(v: string): "ACTIVE" | "PAUSED" | "STOPPED" {
  const s = v.trim().toLowerCase();
  if (s === "inactive" || s === "nghỉ" || s === "dừng") return "STOPPED";
  if (s === "pause" || s === "tạm dừng") return "PAUSED";
  return "ACTIVE";
}

async function main() {
  const [file, writeFlag] = process.argv.slice(2);
  if (!file) {
    console.error('Cách dùng: npx tsx scripts/import-talents.ts "data/Hồ sơ Talent.xlsx" [--write]');
    process.exit(1);
  }
  const write = writeFlag === "--write";

  const wb = XLSX.read(readFileSync(file), { type: "buffer" });
  const ws = wb.Sheets[SHEET];
  if (!ws) {
    console.error(`Không tìm thấy sheet "${SHEET}". Các sheet có: ${wb.SheetNames.join(", ")}`);
    process.exit(1);
  }
  const raw: Row[] = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
  const rows = raw
    .map((r) => {
      const o: Row = {};
      for (const [k, v] of Object.entries(r)) o[k.trim()] = String(v ?? "").trim();
      return o;
    })
    .filter((r) => (r[COL.tiktok] || r[COL.facebook] || r[COL.channelName] || r[COL.talentName]));

  console.log(`Đọc ${rows.length} dòng có dữ liệu từ sheet "${SHEET}".`);
  console.log(`Chế độ: ${write ? "GHI THẬT vào DB" : "XEM TRƯỚC (không ghi)"}\n`);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  // --- Chuẩn bị map Manager -> tài khoản MM ---
  const managerNames = [...new Set(rows.map((r) => r[COL.manager]).filter(Boolean))];
  const existingMMs = await prisma.user.findMany({ where: { role: "MM" } });
  // khớp theo tên rút gọn: "MM Giang" chứa "Giang"
  const mmByName = new Map<string, { id: string; fullName: string }>();
  for (const name of managerNames) {
    const found = existingMMs.find((u) =>
      u.fullName.toLowerCase().includes(name.toLowerCase()),
    );
    if (found) mmByName.set(name, found);
  }
  const missingManagers = managerNames.filter((n) => !mmByName.has(n));
  if (missingManagers.length) {
    console.log(`MM chưa có tài khoản: ${missingManagers.join(", ")}`);
    if (write) {
      const pw = await hash(DEFAULT_MM_PASSWORD, 12);
      for (const name of missingManagers) {
        const email = `${name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/đ/g, "d")
          .replace(/[^a-z0-9]/g, "")}.mm@eps.local`;
        const u = await prisma.user.create({
          data: { email, fullName: `MM ${name}`, role: "MM", passwordHash: pw },
        });
        mmByName.set(name, u);
        console.log(`  + Tạo tài khoản MM: ${u.fullName} <${email}> (mật khẩu: ${DEFAULT_MM_PASSWORD})`);
      }
    } else {
      console.log("  (sẽ được tạo khi chạy --write)\n");
    }
  }

  // --- Gom nhóm theo hashtag ScaleF (không có hashtag => nhóm riêng theo chỉ số dòng) ---
  type Group = {
    key: string;
    talentName: string;
    manager: string;
    status: string;
    scalefUsername: string;
    scalefHashtag: string;
    taxCode: string;
    direction: string;
    channels: { platform: Platform; url: string; handle: string }[];
  };
  // Cảnh báo hashtag trùng giữa nhiều người (hashtag ScaleF đáng lẽ duy nhất) — lỗi nhập liệu cần CFO xử lý.
  const hashtagOwners = new Map<string, Set<string>>();
  for (const r of rows) {
    const h = r[COL.hashtag];
    if (!h) continue;
    const norm = `#${h.replace(/^#/, "")}`;
    const owner = `${r[COL.manager]}/${r[COL.talentName] || r[COL.channelName] || "?"}`;
    (hashtagOwners.get(norm) ?? hashtagOwners.set(norm, new Set()).get(norm)!).add(owner);
  }
  const collisions = [...hashtagOwners.entries()].filter(([, s]) => s.size > 1);
  if (collisions.length) {
    console.log("⚠ Hashtag ScaleF bị trùng giữa nhiều người (cần CFO kiểm tra lại trên ScaleF):");
    for (const [h, owners] of collisions) console.log(`  ${h}: ${[...owners].join("  |  ")}`);
    console.log("  => Import tách riêng theo từng MM để không gộp nhầm.\n");
  }

  const groups = new Map<string, Group>();
  rows.forEach((r, i) => {
    const hashtag = r[COL.hashtag];
    // Gom theo hashtag NHƯNG chỉ khi cùng MM — tránh gộp nhầm 2 người trùng hashtag.
    const key = hashtag ? `#${hashtag.replace(/^#/, "")}::${r[COL.manager]}` : `row-${i}`;
    const handle = tiktokHandle(r[COL.tiktok] || "");
    const name =
      r[COL.talentName] || r[COL.channelName] || handle || r[COL.scalefUser] || "Chưa đặt tên";

    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        talentName: name,
        manager: r[COL.manager],
        status: r[COL.status],
        scalefUsername: r[COL.scalefUser],
        scalefHashtag: hashtag ? `#${hashtag.replace(/^#/, "")}` : "",
        taxCode: r[COL.taxCode],
        direction: r[COL.direction],
        channels: [],
      };
      groups.set(key, g);
    } else {
      // bổ khuyết các field còn trống từ dòng sau
      g.talentName ||= name;
      g.manager ||= r[COL.manager];
      g.scalefUsername ||= r[COL.scalefUser];
      g.taxCode ||= r[COL.taxCode];
      g.direction ||= r[COL.direction];
    }
    if (r[COL.tiktok]) {
      g.channels.push({ platform: "TIKTOK", url: r[COL.tiktok], handle: handle || r[COL.channelName] || g.talentName });
    }
    if (r[COL.facebook]) {
      g.channels.push({ platform: "FACEBOOK", url: r[COL.facebook], handle: r[COL.channelName] || g.talentName });
    }
  });

  console.log(`=> Gom thành ${groups.size} Talent.\n`);

  let created = 0,
    skipped = 0;
  for (const g of groups.values()) {
    const mm = mmByName.get(g.manager);
    const chStr = g.channels.map((c) => c.platform).join("+") || "không kênh";
    const tag = g.scalefHashtag || "(không hashtag)";
    if (!mm) {
      console.log(`  [BỎ QUA] ${g.talentName} — MM "${g.manager}" chưa có tài khoản`);
      skipped++;
      continue;
    }
    console.log(`  ${g.talentName.padEnd(18)} MM:${g.manager.padEnd(6)} ${tag.padEnd(10)} [${chStr}]`);

    if (write) {
      // idempotent: bỏ qua nếu đã có talent cùng hashtag (hoặc cùng tên+MM khi không hashtag)
      const dup = await prisma.talent.findFirst({
        where: g.scalefHashtag
          ? { scalefHashtag: g.scalefHashtag, managerId: mm.id }
          : { fullName: g.talentName, managerId: mm.id },
      });
      if (dup) {
        skipped++;
        continue;
      }
      await prisma.talent.create({
        data: {
          fullName: g.talentName,
          contentDirection: g.direction || null,
          status: mapStatus(g.status),
          managerId: mm.id,
          scalefUsername: g.scalefUsername || null,
          scalefHashtag: g.scalefHashtag || null,
          taxCode: g.taxCode || null,
          channels: {
            create: g.channels.map((c, i) => ({
              platform: c.platform,
              url: c.url,
              handle: c.handle,
              isPrimary: i === 0,
            })),
          },
        },
      });
      created++;
    }
  }

  console.log(
    `\n${write ? "Đã tạo" : "Sẽ tạo"} ${write ? created : groups.size} Talent` +
      (skipped ? `, bỏ qua ${skipped}` : "") +
      ".",
  );
  if (!write) console.log('Chạy lại kèm --write để ghi thật.');
  await prisma.$disconnect();
}

main();
