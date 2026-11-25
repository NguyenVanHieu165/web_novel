import { z } from "zod";
import { strongPasswordSchema } from "./auth.schema";

const httpsAvatarUrlSchema = z.url({
  protocol: /^https$/,
  error: "Nhập đường dẫn ảnh HTTPS hợp lệ",
}).refine((value) => {
  try {
    const url = new URL(value);
    return !url.username && !url.password;
  } catch {
    return false;
  }
}, "Đường dẫn ảnh không được chứa thông tin đăng nhập");

export const avatarUrlSchema = z.union([
  httpsAvatarUrlSchema,
  z.string().regex(/^\/uploads\/avatars\/[a-f0-9]{64}\.webp$/, "Nhập đường dẫn ảnh HTTPS hợp lệ"),
]);

export const readerProfileSchema = z.strictObject({
  displayName: z.string().trim().min(1, "Nhập tên hiển thị").max(255, "Tên tối đa 255 ký tự"),
  avatar: z.string().trim().max(500, "Đường dẫn ảnh tối đa 500 ký tự")
    .pipe(z.union([z.literal(""), avatarUrlSchema])),
});

export const readerPasswordSchema = z.strictObject({
  currentPassword: z.string().min(1, "Nhập mật khẩu hiện tại").max(1024, "Mật khẩu quá dài"),
  newPassword: strongPasswordSchema,
  confirmPassword: z.string().min(1, "Nhập lại mật khẩu mới").max(128, "Mật khẩu xác nhận tối đa 128 ký tự"),
}).refine((value) => value.newPassword !== value.currentPassword, {
  path: ["newPassword"],
  message: "Chọn mật khẩu khác mật khẩu hiện tại",
}).refine((value) => value.newPassword === value.confirmPassword, {
  path: ["confirmPassword"],
  message: "Mật khẩu xác nhận không khớp",
});

export type ReaderProfileInput = z.infer<typeof readerProfileSchema>;
export type ReaderPasswordInput = z.infer<typeof readerPasswordSchema>;
