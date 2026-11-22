import { z } from "zod";
import { normalizeVietnameseText } from "@/lib/utils";

const normalized = (max: number) => z.string().transform((text) => normalizeVietnameseText(text).trim()).pipe(z.string().max(max));
const cover = z.string().trim().max(2000).refine((value) => !value || /^\/uploads\/[a-zA-Z0-9/_.,%()-]+$/.test(value) || /^https:\/\//i.test(value), "Ảnh bìa phải là đường dẫn uploads hoặc URL HTTPS.");
const studioStoryFields = z.object({
  tenTruyen: normalized(255).pipe(z.string().min(1, "Nhập tên truyện.")),
  moTa: normalized(50000),
  anhBia: cover,
  trang_thai: z.enum(["dang_tien_hanh", "hoan_thanh", "tam_dung", "sap_ra_mat"]),
}).strict();
export const studioStorySchema = studioStoryFields.extend({
  moTa: studioStoryFields.shape.moTa.default(""), anhBia: cover.default(""),
  trang_thai: studioStoryFields.shape.trang_thai.default("dang_tien_hanh"),
});
export const studioStoryUpdateSchema = studioStoryFields.partial().refine((input) => Object.keys(input).length > 0, "Chưa có thay đổi.");
export const studioPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type StudioStoryInput = z.output<typeof studioStorySchema>;
export type StudioStoryUpdate = z.output<typeof studioStoryUpdateSchema>;
