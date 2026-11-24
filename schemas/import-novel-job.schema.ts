import { z } from "zod";
import { importUrlSchema } from "@/lib/scraper/types";

const httpImportUrlSchema = importUrlSchema.shape.url.superRefine((value, context) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      context.addIssue({ code: "custom", message: "Import URL must use HTTP or HTTPS." });
    }
    if (url.username || url.password) {
      context.addIssue({ code: "custom", message: "Import URL must not contain credentials." });
    }
    if (url.port && url.port !== "80" && url.port !== "443") {
      context.addIssue({ code: "custom", message: "Import URL uses an unsupported port." });
    }
  } catch {
    context.addIssue({ code: "custom", message: "Import URL is invalid." });
  }
});

export const importNovelOptionsSchema = importUrlSchema.extend({
  url: httpImportUrlSchema,
}).strict();

export const importNovelJobPayloadSchema = importNovelOptionsSchema.extend({
  userId: z.number().int().positive(),
  requestId: z.string().uuid().optional(),
}).strict();

const importNovelIssueSchema = z.object({
  chapter: z.number().min(0).max(999_999.9).optional(),
  code: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(1).max(1_200),
}).strict();

export const importNovelResultSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["queued", "running", "cancelling", "completed", "partial", "cancelled", "failed", "interrupted"]),
  storyTitle: z.string().max(255),
  storySlug: z.string().max(300).optional(),
  storyId: z.number().int().positive().optional(),
  cover: z.string().max(2_000).optional(),
  totalChapters: z.number().int().min(0).max(50_000),
  processedChapters: z.number().int().min(0).max(50_000),
  savedChapters: z.number().int().min(0).max(50_000),
  skippedChapters: z.number().int().min(0).max(50_000),
  lockedChapters: z.number().int().min(0).max(50_000),
  failedChapters: z.number().int().min(0).max(50_000),
  downloadedImages: z.number().int().min(0).max(200_000),
  logs: z.array(z.string().max(1_200)).max(150),
  error: z.string().max(3_000).optional(),
  phase: z.enum(["metadata", "catalogue", "chapters", "waiting", "finished"]).optional(),
  sourceHost: z.string().max(253).optional(),
  sourceUrl: httpImportUrlSchema.optional(),
  sourceName: z.string().max(255).optional(),
  options: importNovelOptionsSchema.optional(),
  errorCode: z.string().max(100).optional(),
  retryAt: z.number().int().nonnegative().optional(),
  warning: z.string().max(3_000).optional(),
  catalogueComplete: z.boolean().optional(),
  sourceTotalChapters: z.number().int().nonnegative().max(50_000).optional(),
  requestId: z.string().uuid().optional(),
  issues: z.array(importNovelIssueSchema).max(50).optional(),
}).strict();

export type ImportNovelJobPayload = z.infer<typeof importNovelJobPayloadSchema>;
export type ImportNovelResult = z.infer<typeof importNovelResultSchema>;
