import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Chặn route theo phiên đăng nhập + role (logic nằm trong callbacks.authorized của auth.config.ts).
// Next.js 16 dùng file proxy.ts thay cho middleware.ts.
export default NextAuth(authConfig).auth;

export const config = {
  // Chạy trên mọi route trừ static assets và API auth
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|ico)$).*)"],
};
