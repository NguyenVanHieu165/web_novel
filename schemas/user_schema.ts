import * as z from "zod";
import { roleIdSchema } from "./admin-roles.schema";

export const userSchema = z.object({
    tenTaikhoan: z.string().min(1, "Tên tài khoản không được để trống"),
    email: z.string().email("Email không hợp lệ"),
    trangThai: z.enum(["active", "locked", "banned"]),
});

export const createUserSchema = userSchema.extend({
    roleId: roleIdSchema.optional(),
    initialPassword: z.string().min(12, "Mật khẩu quản trị cần ít nhất 12 ký tự.").max(50)
        .refine((value) => new TextEncoder().encode(value).length <= 72, "Mật khẩu không được quá 72 byte.")
        .optional(),
});

export type UserFormValues = z.infer<typeof createUserSchema>;
