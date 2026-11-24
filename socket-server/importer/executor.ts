import { createHash } from "node:crypto";
import { scrapeChapter as defaultScrapeChapter, scrapeStory as defaultScrapeStory } from "./adapters";
import { importErrorCode, importErrorMessage } from "./errors";
import { sourceClient } from "./network";
import { chapterContent } from "./normalizer";
import { createInitialImportState } from "./state";
import {
  ImportSourceError,
  SourceBlockedError,
  SourceLockedError,
  SourceRateLimitError,
  type ChapterRef,
  type ImportJob,
  type ImportOptions,
  type ScrapedStory,
} from "./types";

export type StoredImportStory = {
  idTruyen: number;
  slug: string;
  anhBia: string;
  isDeleted: boolean | null;
};

export type ImportStorage = {
  ensureDatabase(): Promise<void>;
  findStory(story: ScrapedStory, sourceUrl: string): Promise<StoredImportStory | null>;
  existingChapterNumbers(storyId: number): Promise<Set<number>>;
  createStoryWithChapter(
    story: ScrapedStory,
    sourceUrl: string,
    cover: string,
    chapter: ChapterRef,
    content: string,
  ): Promise<StoredImportStory>;
  storeChapter(storyId: number, chapter: ChapterRef, content: string, skipExisting: boolean): Promise<boolean>;
  refreshChapterCount(storyId: number): Promise<void>;
};

export type ImageDownloader = (
  raw: string,
  base: string,
  folder: string,
  client: ReturnType<typeof sourceClient>,
  counted: () => void,
) => Promise<string>;

export type ImportExecutorDependencies = {
  storage: ImportStorage;
  downloadImage: ImageDownloader;
  scrapeStory?: typeof defaultScrapeStory;
  scrapeChapter?: typeof defaultScrapeChapter;
  createClient?: typeof sourceClient;
  chapterConcurrency?: number;
  budgetMs?: number;
};

export type ImportExecutionInput = {
  jobId: string;
  userId: number;
  options: ImportOptions;
  requestId?: string;
  signal: AbortSignal;
  report(state: ImportJob, progress: number): Promise<void>;
};

const MAX_LOGS = 150;
const MAX_ISSUES = 50;
const REPORT_CHAPTER_BATCH = 5;
const REPORT_INTERVAL_MS = 2_000;

function progressFor(state: ImportJob) {
  if (state.phase === "metadata") return state.status === "queued" ? 0 : 1;
  if (state.phase === "catalogue") return 3;
  if (state.totalChapters > 0) {
    return Math.min(99, 5 + Math.round(state.processedChapters * 94 / state.totalChapters));
  }
  return state.phase === "finished" ? 99 : 5;
}

export async function executeImportNovel(
  input: ImportExecutionInput,
  dependencies: ImportExecutorDependencies,
): Promise<ImportJob> {
  const source = new URL(input.options.url);
  source.hash = "";
  const options = { ...input.options, url: source.href };
  const state = createInitialImportState(input.jobId, options, input.requestId);
  const internalController = new AbortController();
  const signal = AbortSignal.any([input.signal, internalController.signal]);
  const scrapeStory = dependencies.scrapeStory ?? defaultScrapeStory;
  const scrapeChapter = dependencies.scrapeChapter ?? defaultScrapeChapter;
  const createClient = dependencies.createClient ?? sourceClient;
  const concurrency = Math.max(1, Math.min(3, dependencies.chapterConcurrency ?? 3));
  let lastReportedProcessed = -1;
  let lastReportedAt = 0;
  let reportWork = Promise.resolve();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  const log = (message: string) => {
    state.logs.push(message.slice(0, 1_200));
    if (state.logs.length > MAX_LOGS) state.logs.shift();
  };
  const updateIssue = (error: unknown, chapter?: number) => {
    const issue = {
      chapter,
      code: importErrorCode(error),
      reason: importErrorMessage(error).slice(0, 1_200),
    };
    state.issues ??= [];
    state.issues.push(issue);
    if (state.issues.length > MAX_ISSUES) state.issues.shift();
    log(`${chapter == null ? "Nguồn" : `Chương ${chapter}`}: ${issue.reason}`);
  };
  const failExecution = (error: unknown) => {
    if (!internalController.signal.aborted) internalController.abort(error);
  };
  const report = async (force = false) => {
    const now = Date.now();
    if (!force && state.processedChapters - lastReportedProcessed < REPORT_CHAPTER_BATCH && now - lastReportedAt < REPORT_INTERVAL_MS) {
      return;
    }
    lastReportedProcessed = state.processedChapters;
    lastReportedAt = now;
    const snapshot = structuredClone(state);
    const progress = progressFor(snapshot);
    const operation = reportWork.then(() => input.report(snapshot, progress));
    reportWork = operation.catch(() => undefined);
    try {
      await operation;
    } catch (error) {
      failExecution(error);
      throw error;
    }
  };

  if (dependencies.budgetMs !== undefined) {
    timeout = setTimeout(() => {
      timedOut = true;
      state.errorCode = "TIME_BUDGET";
      state.error = "Đã lưu tiến độ trước giới hạn thời gian chạy. Bấm tiếp tục để lấy các chương còn thiếu.";
      failExecution(new Error("TIME_BUDGET"));
    }, dependencies.budgetMs);
  }

  let workingPhase: ImportJob["phase"] = "metadata";
  const client = createClient(signal, {
    waiting(retryAt, reason) {
      if (signal.aborted) return;
      state.phase = "waiting";
      state.retryAt = Math.max(state.retryAt ?? 0, retryAt);
      log(reason);
      void report(true).catch(failExecution);
    },
    resumed() {
      if (state.phase !== "waiting") return;
      state.phase = workingPhase;
      state.retryAt = undefined;
      log("Đã hết thời gian chờ, đang tiếp tục.");
    },
  }, undefined, options.url);

  let storyId: number | undefined;
  let terminalError: unknown;
  try {
    input.signal.throwIfAborted();
    state.status = "running";
    state.phase = "metadata";
    await report(true);
    await dependencies.storage.ensureDatabase();
    log("Đã xác nhận database web_truyen. Đang đọc thông tin và toàn bộ mục lục…");

    state.phase = workingPhase = "catalogue";
    await report(true);
    const story = await scrapeStory(options.url, client, options.maxChapters);
    story.slug = story.slug.slice(0, 220) || `truyen-${createHash("sha256").update(options.url).digest("hex").slice(0, 16)}`;
    if (!story.chapters.length) {
      throw new ImportSourceError("Không tìm thấy liên kết chương công khai. Nguồn có thể cần adapter riêng.", "NO_CHAPTERS");
    }
    state.storyTitle = story.title.slice(0, 255);
    state.totalChapters = story.chapters.length;
    state.sourceName = story.sourceName;
    state.catalogueComplete = story.catalogueComplete;
    state.sourceTotalChapters = story.sourceTotalChapters;
    state.warning = story.warnings?.join(" ").slice(0, 3_000);
    if (!options.maxChapters && story.catalogueComplete !== true) {
      state.warning = [state.warning, "Chưa xác nhận mục lục chứa toàn bộ chương của nguồn; kết quả sẽ được đánh dấu một phần."].filter(Boolean).join(" ");
    }

    let local = await dependencies.storage.findStory(story, options.url);
    state.cover = local?.anhBia || undefined;
    storyId = local?.idTruyen;
    state.storyId = storyId;
    state.storySlug = local?.slug;
    const existing = local ? await dependencies.storage.existingChapterNumbers(local.idTruyen) : new Set<number>();
    const counted = () => { state.downloadedImages++;
    };
    let missingImages = false;
    let cursor = 0;
    state.phase = workingPhase = "chapters";
    await report(true);

    const bodyFor = async (index: number, slug: string) => {
      const ref = story.chapters[index];
      if (options.skipExisting && existing.has(ref.number)) {
        state.skippedChapters++;
        return null;
      }
      const html = await scrapeChapter(ref, client);
      const content = await chapterContent(html, async (src, alt) => {
        if (!options.downloadImages) return null;
        try {
          const url = await dependencies.downloadImage(src, ref.url, `chapters/${slug}`, client, counted);
          return `<img src="${url}" alt="${alt.replace(/[<>"&]/g, "")}" />`;
        } catch (error) {
          signal.throwIfAborted();
          if (error instanceof SourceBlockedError) throw error;
          missingImages = true;
          updateIssue(new ImportSourceError("Không tải được một ảnh minh họa. Đã giữ phần chữ; có thể cập nhật lại chương khi ảnh nguồn hoạt động.", "IMAGE_FAILED"), ref.number);
          return null;
        }
      });
      if (content.length < 50 && !content.includes('<img src="')) {
        throw new ImportSourceError("Nội dung quá ngắn hoặc không nhận diện được toàn văn; không lưu bản xem thử.", "INCOMPLETE_CONTENT");
      }
      return content;
    };

    const failed = (error: unknown, number: number, chapterIndex: number) => {
      if (signal.aborted && !internalController.signal.aborted) return;
      console.error("[import-chapter-error]", chapterIndex, error);
      updateIssue(error, number);
      if (error instanceof SourceBlockedError) {
        state.error = importErrorMessage(error);
        state.errorCode = importErrorCode(error);
        if (error instanceof SourceRateLimitError) state.retryAt = Math.max(state.retryAt ?? 0, error.retryAt);
        failExecution(error);
        return;
      }
      if (error instanceof SourceLockedError) {
        state.lockedChapters++;
        state.skippedChapters++;
        if (!options.skipLocked) {
          state.error = error.message;
          state.errorCode = "SOURCE_LOCKED";
          failExecution(error);
        }
        return;
      }
      state.failedChapters++;
    };

    while (!local && cursor < story.chapters.length && !signal.aborted) {
      const index = cursor++;
      const ref = story.chapters[index];
      try {
        const content = await bodyFor(index, story.slug);
        if (!content) continue;
        const cover = story.cover
          ? await dependencies.downloadImage(story.cover, options.url, "covers", client, counted).catch((error) => {
              signal.throwIfAborted();
              if (error instanceof SourceBlockedError) throw error;
              log("Không tải được bìa nguồn; nội dung vẫn được nhập.");
              return null;
            })
          : null;
        signal.throwIfAborted();
        local = await dependencies.storage.createStoryWithChapter(story, options.url, cover || "", ref, content);
        state.cover = cover || undefined;
        storyId = local.idTruyen;
        state.storyId = storyId;
        state.storySlug = local.slug;
        state.savedChapters++;
        log(`Đã lưu chương ${ref.number}.`);
      } catch (error) {
        failed(error, ref.number, index);
      } finally {
        state.processedChapters++;
        await report();
      }
    }

    if (local && !signal.aborted) {
      const target = local;
      log(`${story.title}: ${state.totalChapters} chương trong phạm vi import${options.maxChapters ? ` (giới hạn ${options.maxChapters})` : " (toàn bộ mục lục tìm thấy)"}.`);
      const workers = await Promise.allSettled(Array.from({ length: concurrency }, async () => {
        while (cursor < story.chapters.length && !signal.aborted) {
          const index = cursor++;
          const ref = story.chapters[index];
          try {
            const content = await bodyFor(index, target.slug);
            signal.throwIfAborted();
            if (content) {
              if (await dependencies.storage.storeChapter(target.idTruyen, ref, content, options.skipExisting)) {
                state.savedChapters++;
                log(`Đã lưu chương ${ref.number}.`);
              } else {
                state.skippedChapters++;
              }
            }
          } catch (error) {
            failed(error, ref.number, index);
          } finally {
            state.processedChapters++;
            await report();
          }
        }
      }));
      const rejected = workers.find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (rejected) throw rejected.reason;
    }

    if (input.signal.aborted) {
      state.status = "cancelled";
      terminalError = input.signal.reason ?? new Error("Import cancelled");
    } else if (timedOut) {
      state.status = "interrupted";
    } else if (internalController.signal.aborted) {
      state.status = "failed";
      terminalError = internalController.signal.reason;
    } else if (!local) {
      throw new ImportSourceError("Không có chương toàn văn đọc được. Không tạo truyện rỗng; xem lý do từng chương trong nhật ký.", "NO_READABLE_CHAPTERS");
    } else {
      state.status = state.failedChapters || missingImages || !options.maxChapters && story.catalogueComplete !== true ? "partial" : "completed";
    }
  } catch (error) {
    terminalError = error;
    if (input.signal.aborted) {
      state.status = "cancelled";
    } else if (timedOut) {
      state.status = "interrupted";
    } else {
      state.status = "failed";
      state.error = importErrorMessage(error);
      state.errorCode = importErrorCode(error);
      if (error instanceof SourceRateLimitError) state.retryAt = Math.max(state.retryAt ?? 0, error.retryAt);
      updateIssue(error);
    }
    if (state.storyTitle === "Đang nhận diện truyện…") state.storyTitle = `Nguồn: ${new URL(options.url).hostname}`;
  } finally {
    if (timeout) clearTimeout(timeout);
    state.phase = "finished";
    if (storyId) {
      try {
        await dependencies.storage.refreshChapterCount(storyId);
      } catch (error) {
        updateIssue(new ImportSourceError("Chương đã lưu nhưng chưa cập nhật được thống kê truyện.", "STATISTICS_FAILED"));
        if (state.status === "completed") state.status = "partial";
        state.errorCode ??= "STATISTICS_FAILED";
        state.error ??= importErrorMessage(error);
      }
    }
    log(`Kết thúc: ${state.savedChapters} chương lưu, ${state.skippedChapters} bỏ qua, ${state.failedChapters} lỗi chương.`);
    await report(true);
    await reportWork;
  }

  if (input.signal.aborted) throw terminalError ?? input.signal.reason ?? new Error("Import cancelled");
  return state;
}
