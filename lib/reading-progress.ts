import { z } from "zod";

export const readingProgressInputSchema = z.strictObject({
  position: z.number().int().min(0).max(4_294_967_295),
  percent: z.number().min(0).max(100),
});

export const readingProgressSchema = readingProgressInputSchema.extend({
  updatedAt: z.string().datetime().nullable(),
});

export const progressResponseSchema = z.object({
  success: z.literal(true),
  data: readingProgressSchema,
});

export type ReadingProgress = z.infer<typeof readingProgressSchema>;

export const readingHistoryResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(z.object({
    chapterId: z.number().int().positive(),
    chapterTitle: z.string(),
    chapterSlug: z.string(),
    storyTitle: z.string(),
    storySlug: z.string(),
    storyCover: z.string(),
    position: z.number().int().nonnegative(),
    percent: z.number().min(0).max(100),
    updatedAt: z.string().datetime().nullable(),
  })),
  meta: z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPage: z.number().int().positive(),
  }),
});

export type ReadingHistoryResponse = z.infer<typeof readingHistoryResponseSchema>;
