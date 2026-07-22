"use server";

import { signIn, signOut } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

export async function loginAction(formData: FormData) {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/login?error=${encodeURIComponent("Sai email hoặc mật khẩu, hoặc tài khoản đã bị khóa")}`);
    }
    throw error; // NEXT_REDIRECT phải được ném tiếp
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
