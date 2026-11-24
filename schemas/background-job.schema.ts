import { z } from "zod";
import { backgroundJobStatuses, backgroundJobTypes } from "@/lib/background-jobs/types";
export {
  importNovelJobPayloadSchema,
  importNovelOptionsSchema,
  importNovelResultSchema,
  type ImportNovelJobPayload,
  type ImportNovelResult,
} from "@/schemas/import-novel-job.schema";
import { importNovelJobPayloadSchema } from "@/schemas/import-novel-job.schema";

export const backgroundJobIdSchema = z.string().uuid();
export const backgroundJobTypeSchema = z.enum(backgroundJobTypes);
export const backgroundJobStatusSchema = z.enum(backgroundJobStatuses);

export const noopJobPayloadSchema = z.object({
  message: z.string().trim().min(1).max(200).default("Kiểm tra background worker"),
  delayMs: z.number().int().min(0).max(30_000).default(100),
}).strict();

const enqueueOptionsSchema = z.object({
  ownerId: z.number().int().positive().optional(),
  dedupeKey: z.string().trim().min(1).max(191).optional(),
  priority: z.number().int().min(-32_768).max(32_767).default(0),
  maxAttempts: z.number().int().min(1).max(20).default(3),
  runAt: z.date().default(() => new Date()),
});

export const enqueueBackgroundJobSchema = z.discriminatedUnion("type", [
  enqueueOptionsSchema.extend({
    type: z.literal("system.noop"),
    payload: noopJobPayloadSchema,
  }),
  enqueueOptionsSchema.extend({
    type: z.literal("IMPORT_NOVEL"),
    payload: importNovelJobPayloadSchema,
  }),
]);

export const backgroundJobDiagnosticSchema = noopJobPayloadSchema.extend({
  dedupeKey: z.string().trim().min(1).max(191).optional(),
});

export type EnqueueBackgroundJobInput = z.input<typeof enqueueBackgroundJobSchema>;
