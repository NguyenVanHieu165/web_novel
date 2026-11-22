import { z } from "zod";

export const commentResponseSchema = z.object({
  idBinhLuan: z.number().int().positive(),
  noiDung: z.string(),
  likeCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  authorName: z.string(),
  authorAvatar: z.string().nullable().optional(),
  isStoryAuthor: z.boolean().optional(),
  replyTo: z.number().nullable().optional(),
});
export const commentsPageSchema = z.object({
  success: z.literal(true),
  data: z.array(commentResponseSchema),
  meta: z.object({
    page: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPage: z.number().int().positive(),
  }),
});
export const createdCommentSchema = z.object({ success: z.literal(true), data: commentResponseSchema });
export const commentErrorSchema = z.object({ message: z.string() });
