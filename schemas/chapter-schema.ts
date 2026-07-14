import * as z from "zod";

export const chapterSchema = z
  .object({
    idTruyen: z.number().int().positive("Vui lòng chọn truyện"),
    chuongSo: z
      .number()
      .positive("Số chương phải lớn hơn 0")
      .max(9999.9, "Số chương quá lớn"),
    tieuDeChuong: z
      .string()
      .trim()
      .min(1, "Tiêu đề chương không được để trống")
      .max(300, "Tiêu đề chương tối đa 300 ký tự"),
    slug: z
      .string()
      .trim()
      .min(1, "Slug không được để trống")
      .max(300, "Slug tối đa 300 ký tự"),
    isFree: z.boolean().default(true),
    giaXu: z.number().int().min(0, "Giá xu không được âm").default(0),
    noiDung: z.string().trim().optional().default(""),
  })
  .superRefine((data, ctx) => {
    if (!data.isFree && data.giaXu <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["giaXu"],
        message: "Chương trả phí cần có giá xu lớn hơn 0",
      });
    }
  });

export type ChapterFormInput = z.input<typeof chapterSchema>;
export type ChapterFormValues = z.infer<typeof chapterSchema>;
