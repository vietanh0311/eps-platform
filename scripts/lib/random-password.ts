// Sinh mật khẩu ngẫu nhiên an toàn cho tài khoản mới tạo (seed/import) — thay cho mật khẩu cứng.
// Bỏ ký tự dễ nhầm khi đọc/gõ tay: 0/O, 1/l/I.
import { randomInt } from "node:crypto";

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function randomPassword(length = 14): string {
  return Array.from({ length }, () => CHARSET[randomInt(CHARSET.length)]).join("");
}
