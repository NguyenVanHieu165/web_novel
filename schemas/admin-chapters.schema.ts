import { z } from "zod";

export const chapterIdSchema = z.coerce.number().int().positive().max(2_147_483_647);
export const MAX_CHAPTER_PRICE = 2_147_483_647;
const chapterNumber = z.number().min(0).max(999999.9).multipleOf(0.1);
const price = z.number().int().min(1).max(MAX_CHAPTER_PRICE);
export const adminChaptersQuerySchema = z.strictObject({
  q: z.string().trim().max(200).default(""),
  storyId: chapterIdSchema.optional(),
  vipFilter: z.enum(["all", "free", "vip"]).default("all"),
  publicationFilter: z.enum(["all", "published", "draft"]).default("published"),
  shortOnly: z.enum(["true", "false"]).default("false"),
  sortBy: z.enum(["id", "truyen", "soChuong", "tieuDe", "giaXu", "wordCount", "ngayTao"]).default("soChuong"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const ids = z.array(z.number().int().positive().max(2_147_483_647)).min(1).max(100).transform((values) => [...new Set(values)]);
export const chapterBulkSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("set-vip"), chapterIds: ids, giaXu: price }),
  z.strictObject({ action: z.literal("set-free"), chapterIds: ids }),
  z.strictObject({ action: z.literal("delete"), chapterIds: ids }),
]);
export const autoVipSchema = z.strictObject({ storyId: z.number().int().positive().max(2_147_483_647), fromChapter: chapterNumber, giaXu: price });
export type AdminChaptersQuery = z.infer<typeof adminChaptersQuerySchema>;
export type ChapterBulkInput = z.infer<typeof chapterBulkSchema>;
export const defaultChaptersQuery = adminChaptersQuerySchema.parse({});

export function parseChapterNumberSearch(q: string): { from: number; to: number } | null {
  const match = /^(\d+(?:\.\d)?)(?:\s*[-–]\s*(\d+(?:\.\d)?))?$/.exec(q);
  if (!match) return null;
  const from = Number(match[1]), to = Number(match[2] ?? match[1]);
  return from <= to && to <= 999999.9 ? { from, to } : null;
}
