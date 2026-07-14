import * as z from "zod";

export const storySchema = z.object({
    tenTruyen: z.string().min(1, "Tên truyện không được để trống"),
    slug: z.string().min(1, "Slug không được để trống"),
    anhBia: z.string().optional().nullable().default(""),
    anhThumbnail: z.string().optional().nullable().default(null),
    trang_thai: z.enum(["dang_tien_hanh", "hoan_thanh", "tam_dung", "sap_ra_mat"]),
    theLoaiIds: z.array(z.number()).default([]),
});

export type StoryFormInput = z.input<typeof storySchema>;
export type StoryFormValues = z.infer<typeof storySchema>;
