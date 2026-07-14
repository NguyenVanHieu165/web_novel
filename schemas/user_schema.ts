import * as z from "zod";

export const userSchema = z.object({
    tenTaikhoan: z.string().min(1, "Tên tài khoản không được để trống"),
    email: z.string().email("Email không hợp lệ"),
    trangThai: z.enum(["active", "locked", "banned"]),
});

export type UserFormValues = z.infer<typeof userSchema>;
