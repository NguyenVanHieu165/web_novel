import type { Pool } from "mariadb";
import { executeImportNovel, type ImportExecutorDependencies } from "../../importer/executor";
import { downloadImportImage } from "../../importer/media";
import { createMariaDbImportStorage } from "../../importer/storage";
import { PermanentJobError } from "../errors";
import { importNovelJobPayloadSchema, importNovelResultSchema } from "../schemas/import-novel";
import type { JobHandler } from "../types";

export function createImportNovelHandler(
  pool: Pool,
  overrides: Partial<ImportExecutorDependencies> = {},
): JobHandler {
  const dependencies: ImportExecutorDependencies = {
    storage: overrides.storage ?? createMariaDbImportStorage(pool),
    downloadImage: overrides.downloadImage ?? downloadImportImage,
    scrapeStory: overrides.scrapeStory,
    scrapeChapter: overrides.scrapeChapter,
    createClient: overrides.createClient,
    chapterConcurrency: overrides.chapterConcurrency,
  };

  return async (rawPayload, context) => {
    const parsed = importNovelJobPayloadSchema.safeParse(rawPayload);
    if (!parsed.success) throw new PermanentJobError("Invalid IMPORT_NOVEL payload");
    const { userId, requestId, ...options } = parsed.data;
    if (context.job.ownerId !== userId) {
      throw new PermanentJobError("IMPORT_NOVEL owner does not match payload userId");
    }

    const result = await executeImportNovel({
      jobId: context.job.id,
      userId,
      options,
      requestId,
      signal: context.signal,
      report: async (state, progress) => {
        await context.reportProgress(progress, importNovelResultSchema.parse(state));
      },
    }, dependencies);
    return importNovelResultSchema.parse(result);
  };
}
