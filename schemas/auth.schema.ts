import { z } from "zod";

export const registerSchema = z
  .object({
    tenTaiKhoan: z
      .string()
      .trim()
      .min(3, "Tên tài khoản tối thiểu 3 ký tự")
      .max(30, "Tên tài khoản tối đa 30 ký tự")
      .regex(/^[a-zA-Z0-9_]+$/, "Tên tài khoản chỉ chứa chữ cái, số và dấu gạch dưới"),
    email: z
      .string()
      .trim()
      .email("Email không đúng định dạng")
      .max(100, "Email không được vượt quá 100 ký tự"),
    matKhau: z
      .string()
      .min(6, "Mật khẩu tối thiểu 6 ký tự")
      .max(128, "Mật khẩu không được quá 128 ký tự"),
    xacNhanMatKhau: z.string().min(1, "Vui lòng xác nhận lại mật khẩu").max(128),
  })
  .refine((data) => data.matKhau === data.xacNhanMatKhau, {
    message: "Mật khẩu xác nhận không khớp",
    path: ["xacNhanMatKhau"],
  });

export const loginSchema = z.object({
  usernameOrEmail: z.string().trim().min(1, "Vui lòng nhập tên tài khoản hoặc email").max(100),
  matKhau: z.string().min(1, "Vui lòng nhập mật khẩu").max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
