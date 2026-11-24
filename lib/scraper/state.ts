import type { ImportJob, ImportOptions } from "./types";

export function createInitialImportState(
  jobId: string,
  options: ImportOptions,
  requestId?: string,
): ImportJob {
  const source = new URL(options.url);
  source.hash = "";
  const normalizedOptions = { ...options, url: source.href };
  return {
    id: jobId,
    status: "queued",
    phase: "metadata",
    sourceHost: source.hostname,
    sourceUrl: source.href,
    options: normalizedOptions,
    requestId,
    storyTitle: "Đang nhận diện truyện…",
    totalChapters: 0,
    processedChapters: 0,
    savedChapters: 0,
    skippedChapters: 0,
    lockedChapters: 0,
    failedChapters: 0,
    downloadedImages: 0,
    logs: [],
    issues: [],
  };
}
