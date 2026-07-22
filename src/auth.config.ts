import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/generated/prisma/enums";

// Cấu hình dùng chung giữa proxy (không được import Prisma) và auth chính.
// Provider Credentials (cần Prisma + bcrypt) nằm ở src/auth.ts.

// Route chỉ CFO/COO được vào
const CFO_ONLY_PREFIXES = ["/admin"];
// Route cần đăng nhập với role nội bộ (Talent chưa có giao diện riêng — đã chốt với CFO)
const STAFF_ROLES: Role[] = ["CFO", "MM", "TECH"];

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [], // điền ở src/auth.ts
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as Role;
      return session;
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth?.user;
      const role = auth?.user?.role;

      if (pathname.startsWith("/login")) {
        // Đã đăng nhập thì không quay lại trang login
        if (isLoggedIn) {
          return Response.redirect(new URL("/", request.nextUrl));
        }
        return true;
      }

      if (!isLoggedIn) return false; // tự redirect về pages.signIn

      if (CFO_ONLY_PREFIXES.some((p) => pathname.startsWith(p)) && role !== "CFO") {
        return Response.redirect(new URL("/", request.nextUrl));
      }

      // Toàn bộ khu vực nội bộ yêu cầu role staff
      if (!role || !STAFF_ROLES.includes(role)) {
        return Response.redirect(new URL("/login", request.nextUrl));
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
