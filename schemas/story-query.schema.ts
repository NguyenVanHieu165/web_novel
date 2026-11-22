import { z } from "zod";

export const storySearchMaxLength = 100;
export const storySearchMaxPage = 100_000;

export const storyQuerySchema = z.object({
  q: z.string().trim().max(storySearchMaxLength).optional().default(""),
  theLoai: z.string().trim().min(1).max(100).optional(),
  trangThai: z
    .enum(["tat_ca", "dang_tien_hanh", "hoan_thanh", "tam_dung", "sap_ra_mat"])
    .optional()
    .default("tat_ca"),
  sapXep: z
    .enum(["luotXem", "moiNhat", "capNhat", "danhGia"])
    .optional()
    .default("luotXem"),
  soChuong: z
    .enum(["all", "duoi-100", "100-500", "tren-500"])
    .optional()
    .default("all"),
  page: z.coerce.number().int().positive().max(storySearchMaxPage).optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export type StoryQueryInput = z.infer<typeof storyQuerySchema>;

type RawSearchParams = Record<string, unknown>;

function fieldOrDefault<T>(schema: z.ZodType<T>, value: unknown, fallback: T): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : fallback;
}

export function parseStoryQueryParams(
  searchParams: RawSearchParams,
  defaults: Partial<StoryQueryInput> = {},
): StoryQueryInput {
  const fallback = storyQuerySchema.parse(defaults);
  const shape = storyQuerySchema.shape;
  // A malformed page or duplicated parameter must not discard an otherwise valid search.
  return {
    q: fieldOrDefault(shape.q, searchParams.q ?? fallback.q, fallback.q),
    theLoai: fieldOrDefault(shape.theLoai, searchParams.theLoai ?? fallback.theLoai, fallback.theLoai),
    trangThai: fieldOrDefault(shape.trangThai, searchParams.trangThai ?? fallback.trangThai, fallback.trangThai),
    sapXep: fieldOrDefault(shape.sapXep, searchParams.sapXep ?? fallback.sapXep, fallback.sapXep),
    soChuong: fieldOrDefault(shape.soChuong, searchParams.soChuong ?? fallback.soChuong, fallback.soChuong),
    page: fieldOrDefault(shape.page, searchParams.page ?? fallback.page, fallback.page),
    limit: fieldOrDefault(shape.limit, searchParams.limit ?? fallback.limit, fallback.limit),
  };
}
