"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";

// Nút submit form có hỏi xác nhận trước — dùng cho mọi hành động xoá (Talent, video, kênh...)
// để tránh bấm nhầm mất dữ liệu không khôi phục được.
export function ConfirmSubmitButton({
  confirmMessage,
  onClick,
  ...props
}: ComponentProps<typeof Button> & { confirmMessage: string }) {
  return (
    <Button
      type="submit"
      {...props}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    />
  );
}
