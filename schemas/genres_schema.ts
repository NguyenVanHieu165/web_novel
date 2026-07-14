import * as z from "zod";

export const genres_schema = z.object({
    tenTheLoai: z.string().min(2, { message: "Tên thể loại phải có ít nhất 2 ký tự" })
        .max(100, { message: "Tên thể loại không vượt quá 100 ký tự" })
        .trim(),
    moTa: z.string().optional().or(z.literal("")),
}
);
export type GenresFormValues = z.infer<typeof genres_schema>;