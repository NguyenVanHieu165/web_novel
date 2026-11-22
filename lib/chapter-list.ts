import { z } from "zod";

export const CHAPTER_PAGE_SIZE = 50;

export const chapterListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(CHAPTER_PAGE_SIZE),
  search: z.string().trim().max(100).default(""),
  order: z.enum(["asc", "desc"]).default("asc"),
  chapterId: z.coerce.number().int().positive().max(2_147_483_647).optional(),
  includeAccess: z.literal("1").optional(),
});

export const chapterListPageSchema = z.object({
  data: z.array(z.object({
    idChuong: z.number().int().positive(),
    chuongSo: z.coerce.number().nonnegative(),
    slug: z.string(),
    tieuDeChuong: z.string(),
    isFree: z.boolean().nullable(),
    giaXu: z.number().nonnegative().nullable(),
    canRead: z.boolean().optional(),
    updatedAt: z.string().nullable().optional(),
  })),
  meta: z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPage: z.number().int().positive(),
  }),
});

export type ChapterListPage = z.infer<typeof chapterListPageSchema>;

// Chapter numbers are stored as Decimal(7, 1), not arbitrary JavaScript numbers.
export function getChapterNumberSearch(search: string): number | null {
  const value = search.trim().replace(/^(?:chương|chuong)\s*/iu, "").replace(",", ".");
  return /^\d{1,6}(?:\.\d)?$/.test(value) ? Number(value) : null;
}
