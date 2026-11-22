import { z } from "zod";
import { chapterSchema } from "./chapter-schema";

const fields = {
  ...chapterSchema.shape,
  publication: z.enum(["draft", "published"]).default("published"),
  noiDung: z.string().max(1_000_000, "Mỗi chương tối đa 1 triệu ký tự").default(""),
  giaXu: z.number().int().min(0).max(1_000_000).default(0),
  slug: z.string().trim().max(300).default(""),
};
function validate(value: { chuongSo: number; isFree: boolean; giaXu: number; publication: "draft" | "published"; noiDung: string }, ctx: z.RefinementCtx) {
  if (!value.isFree && value.giaXu <= 0) ctx.addIssue({ code: "custom", path: ["giaXu"], message: "Chương trả phí cần có giá xu lớn hơn 0" });
  if (Math.abs(value.chuongSo * 10 - Math.round(value.chuongSo * 10)) > 0.00001) ctx.addIssue({ code: "custom", path: ["chuongSo"], message: "Số chương chỉ được có một chữ số thập phân" });
  if (value.publication === "published" && !value.noiDung.trim()) ctx.addIssue({ code: "custom", path: ["noiDung"], message: "Chương xuất bản cần có nội dung" });
}
export const writingChapterSchema = z.object({ ...fields, idChuong: z.number().int().positive().optional() }).superRefine(validate);
export const chapterImportSchema = z.object({
  idTruyen: z.number().int().positive(),
  chapters: z.array(z.object({ ...fields, idTruyen: z.number().int().positive().optional() }).superRefine(validate)).min(1).max(500),
}).superRefine((value, ctx) => {
  if (value.chapters.reduce((total, chapter) => total + chapter.noiDung.length, 0) > 10 * 1024 * 1024) ctx.addIssue({ code: "custom", path: ["chapters"], message: "Tổng nội dung mỗi lần import tối đa 10 MB" });
});
export type WritingChapterInput = z.input<typeof writingChapterSchema>;
