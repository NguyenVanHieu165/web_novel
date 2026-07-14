import * as z from "zod";

export const editFormSchema = z.object({
    id: z.string(),
    name: z.string().min(2, "Tên phải có ít nhất 2 ký tự"),
    trang_thai: z.enum(["dang_tien_hanh", "tam_dung", "hoan_thanh"]),
});

export type EditFormValues = z.infer<typeof editFormSchema>;