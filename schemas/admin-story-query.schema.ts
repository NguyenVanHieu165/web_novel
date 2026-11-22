import { z } from "zod";

const positiveInteger = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(2_147_483_647));
export const adminStoryQuerySchema = z.object({
  q: z.string().trim().max(100).default(""),
  search: z.string().trim().max(100).optional(),
  genreId: positiveInteger.optional(),
  genre: z.string().trim().min(1).max(100).refine((value) => !/^\d+$/.test(value) || (Number(value) > 0 && Number(value) <= 2_147_483_647), "Thể loại không hợp lệ").optional(),
  status: z.enum(["all", "hoan_thanh", "dang_ra", "dang_tien_hanh", "tam_dung", "sap_ra_mat"]).default("all"),
  chapterRange: z.enum(["all", "empty", "1-20", "21-100", "100+"]).default("all"),
  vipOnly: z.enum(["true", "false"]).default("false"),
  sortBy: z.enum(["id", "tenTruyen", "soChuong", "luotXem", "ngayTao", "trang_thai"]).default("ngayTao"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: positiveInteger.pipe(z.number().max(100_000)).default(1),
  limit: positiveInteger.pipe(z.number().max(100)).default(15),
}).transform(({ search, ...query }) => ({ ...query, q: query.q || search || "" }));

export type AdminStoryQuery = z.infer<typeof adminStoryQuerySchema>;
export type AdminStorySort = AdminStoryQuery["sortBy"];
export const defaultAdminStoryQuery = adminStoryQuerySchema.parse({});

export function adminStoryQueryParams(query: AdminStoryQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== defaultAdminStoryQuery[key as keyof AdminStoryQuery]) {
      params.set(key, String(value));
    }
  }
  return params;
}
