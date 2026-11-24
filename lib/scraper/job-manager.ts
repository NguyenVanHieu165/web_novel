import { randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import { sourceClient } from "./network";
import { scrapeChapter, scrapeStory } from "./adapters";
import { importErrorCode, importErrorMessage } from "./errors";
import { downloadImage } from "./media";
import { createImportStoryWithChapter, ensureImportDatabase, existingImportChapterNumbers, findImportStory, storeImportChapter } from "./storage";
import { checkpointStore } from "./checkpoints";
import { databaseCheckpointStore } from "./database-checkpoints";
import { ImportSourceError, terminal, type ImportJob, type ImportOptions } from "./types";
import { safeErrorDiagnostic } from "../server/system-log-sanitizer";
import { executeImportNovel, type ImportStorage } from "../../socket-server/importer/executor";

type Store = ReturnType<typeof checkpointStore> & { shared?: boolean };
type ImportLogEntry = {
  level: "info" | "warning" | "error" | "critical"; source: string; code?: string; message: string;
  details?: unknown; requestId?: string; jobId?: string; actorId?: number;
};
type JobContext = { requestId?: string; writeLog?: (entry: ImportLogEntry) => Promise<unknown> };
type InternalJob = { state: ImportJob; owner: number; options: ImportOptions; controller: AbortController; updated: number; store: Store; context: JobContext; running?: boolean };
const CHAPTER_CONCURRENCY = 3;
const globalJobs = globalThis as unknown as { novelImportJobs?: Map<string, InternalJob> };
const jobs = globalJobs.novelImportJobs ??= new Map();
const disk: Store = process.env.VERCEL ? databaseCheckpointStore(prisma) : checkpointStore();
function log(job: InternalJob, message: string) {
  job.state.logs.push(message.slice(0, 1200)); if (job.state.logs.length > 150) job.state.logs.shift(); job.updated = Date.now();
}
async function systemLog(context: JobContext, entry: ImportLogEntry) {
  if (!context.writeLog) return;
  try { await context.writeLog(entry); }
  catch (error) { console.error("[import-system-log-failed]", safeErrorDiagnostic(error)); }
}
async function persist(job: InternalJob) {
  try { await (job.store ?? disk).write({ version: 1, owner: job.owner, options: job.options, state: job.state, updated: Date.now() }); }
  catch (error) {
    const cause = safeErrorDiagnostic(error);
    console.error("[import-checkpoint-write-failed]", { jobId: job.state.id, requestId: job.context.requestId, cause });
    await systemLog(job.context, {
      level: "critical", source: "story-import", code: "CHECKPOINT_FAILED",
      message: "Không lưu được checkpoint của phiên import.",
      details: { operation: "write", cause }, requestId: job.context.requestId,
      jobId: job.state.id, actorId: job.owner,
    });
    throw new ImportSourceError("Không lưu được tiến độ import. Kiểm tra kết nối database hoặc quyền ghi checkpoint local rồi tiếp tục từ các chương đã lưu.", "CHECKPOINT_FAILED");
  }
}
async function owned(id: string, owner: number, context: JobContext = {}) {
  const current = jobs.get(id);
  if (current && (current.running || !disk.shared)) {
    if (current.owner !== owner) return null;
    current.context = {
      requestId: current.context.requestId ?? context.requestId,
      writeLog: context.writeLog ?? current.context.writeLog,
    };
    current.state.requestId ??= current.context.requestId;
    // Existing dev jobs can predate this module version after HMR.
    current.state.options ??= current.options;
    current.state.sourceUrl ??= current.options.url;
    current.state.sourceHost ??= new URL(current.options.url).hostname;
    return current;
  }
  let stored;
  try { stored = await disk.read(id, owner); }
  catch (error) {
    const cause = safeErrorDiagnostic(error);
    console.error("[import-checkpoint-read-failed]", { jobId: id, requestId: context.requestId, cause });
    await systemLog(context, {
      level: "critical", source: "story-import", code: "CHECKPOINT_FAILED",
      message: "Không đọc được checkpoint của phiên import.", details: { operation: "read", cause },
      requestId: context.requestId, jobId: id, actorId: owner,
    });
    throw new ImportSourceError("Không đọc được checkpoint của phiên import. Có thể nhập lại URL và bật bỏ qua chương đã tồn tại để tiếp tục từ DB.", "CHECKPOINT_FAILED");
  }
  if (!stored) return null;
  const restoredContext = { ...context, requestId: stored.state.requestId ?? context.requestId };
  const job: InternalJob = { ...stored, controller: new AbortController(), store: disk, context: restoredContext };
  job.state.requestId ??= context.requestId;
  jobs.set(id, job); return job;
}
export async function createJob(owner: number, options: ImportOptions, store = disk, context: JobContext = {}) {
  if (store.shared) {
    for (const job of jobs.values()) if (!job.running && !terminal(job.state.status)) await owned(job.state.id, job.owner, context);
  }
  for (const [id, job] of jobs) if (terminal(job.state.status) && Date.now() - job.updated > 6 * 3600000) jobs.delete(id);
  if ([...jobs.values()].some(j => j.running || !terminal(j.state.status))) throw new ImportSourceError("Đang có phiên import chạy. Hãy chờ hoặc dừng phiên hiện tại.", "JOB_BUSY");
  if (jobs.size >= 30) { const oldest = [...jobs.values()].filter(j => terminal(j.state.status)).sort((a, b) => a.updated - b.updated)[0]; if (oldest) jobs.delete(oldest.state.id); }
  const url = new URL(options.url); url.hash = ""; options = { ...options, url: url.href };
  const pendingCooldown = [...jobs.values()].find(j => j.state.sourceHost === url.hostname && (j.state.retryAt ?? 0) > Date.now());
  if (pendingCooldown) throw new ImportSourceError("Nguồn vẫn yêu cầu chờ. Hãy đợi hết thời gian hiển thị trước khi tạo lại phiên cho nguồn này.", "RATE_LIMITED");
  const state: ImportJob = { id: randomUUID(), status: "queued", phase: "metadata", sourceHost: url.hostname, sourceUrl: url.href, options,
    storyTitle: "Đang nhận diện truyện…", totalChapters: 0, processedChapters: 0, savedChapters: 0, skippedChapters: 0, lockedChapters: 0, failedChapters: 0, downloadedImages: 0, logs: [], issues: [] };
  state.requestId = context.requestId;
  const job: InternalJob = { state, owner, options, controller: new AbortController(), updated: Date.now(), store, context };
  jobs.set(state.id, job);
  try {
    const retryAt = await store.cooldown(url.hostname);
    if (retryAt > Date.now()) throw new ImportSourceError(`Nguồn vẫn yêu cầu chờ ít nhất ${Math.ceil((retryAt - Date.now()) / 1000)} giây. Không khởi tạo lại request trong thời gian này.`, "RATE_LIMITED");
    await persist(job);
  } catch (error) { jobs.delete(state.id); throw error; }
  return state.id;
}
export async function getJob(id: string, owner: number, context: JobContext = {}): Promise<ImportJob | null> {
  const job = await owned(id, owner, context); return job ? structuredClone(job.state) : null;
}
export async function cancelJob(id: string, owner: number, context: JobContext = {}) {
  const job = await owned(id, owner, context); if (!job) return null;
  if (!terminal(job.state.status)) { job.state.status = "cancelling"; job.controller.abort(new Error("Admin hủy import.")); log(job, "Đang dừng. Các chương đã lưu được giữ lại."); await persist(job); }
  return getJob(id, owner, context);
}
export async function resumeJob(id: string, owner: number, context: JobContext = {}) {
  const old = await owned(id, owner, context); if (!old) return null;
  if (!terminal(old.state.status)) throw new ImportSourceError("Phiên này vẫn đang chạy.", "JOB_BUSY");
  if (old.state.retryAt && old.state.retryAt > Date.now()) throw new ImportSourceError("Nguồn vẫn đang yêu cầu chờ. Hãy tiếp tục sau thời điểm hiển thị.", "RATE_LIMITED");
  return createJob(owner, { ...old.options, skipExisting: true }, old.store, context);
}
type RunServices = {
  db: typeof prisma; scrapeStory: typeof scrapeStory; scrapeChapter: typeof scrapeChapter;
  createStory: typeof createImportStoryWithChapter; storeChapter: typeof storeImportChapter; findStory: typeof findImportStory;
  client: ReturnType<typeof sourceClient>; budgetMs: number; downloadImage: typeof downloadImage;
};
export async function runJob(id: string, overrides: Partial<RunServices> = {}) {
  const job = jobs.get(id); if (!job || terminal(job.state.status) || job.running) return;
  job.running = true;
  const services = {
    db: prisma,
    scrapeStory,
    scrapeChapter,
    createStory: createImportStoryWithChapter,
    storeChapter: storeImportChapter,
    findStory: findImportStory,
    budgetMs: process.env.VERCEL ? 40_000 : 240_000,
    downloadImage,
    ...overrides,
  };
  const storage: ImportStorage = {
    ensureDatabase: () => ensureImportDatabase(services.db),
    findStory: (story, sourceUrl) => services.findStory(services.db, story, sourceUrl),
    existingChapterNumbers: (storyId) => existingImportChapterNumbers(services.db, storyId),
    createStoryWithChapter: (story, sourceUrl, cover, chapter, content) =>
      services.createStory(services.db, story, sourceUrl, cover, chapter, content),
    storeChapter: (storyId, chapter, content, skipExisting) =>
      services.storeChapter(services.db, storyId, chapter, content, skipExisting),
    async refreshChapterCount(storyId) {
      const count = await services.db.chuong.count({ where: { idTruyen: storyId } });
      await services.db.truyen.update({ where: { idTruyen: storyId }, data: { soChuong: count } });
    },
  };
  const client = services.client;

  try {
    const result = await executeImportNovel({
      jobId: id,
      userId: job.owner,
      options: job.options,
      requestId: job.context.requestId,
      signal: job.controller.signal,
      async report(state) {
        job.state = state;
        job.updated = Date.now();
        await persist(job);
      },
    }, {
      storage,
      downloadImage: services.downloadImage,
      scrapeStory: services.scrapeStory,
      scrapeChapter: services.scrapeChapter,
      createClient: client ? () => client : undefined,
      chapterConcurrency: CHAPTER_CONCURRENCY,
      budgetMs: services.budgetMs,
    });
    job.state = result;
    if (result.status === "failed") {
      await systemLog(job.context, {
        level: "error", source: "story-import", code: result.errorCode ?? "IMPORT_FAILED",
        message: result.error ?? "Phiên import thất bại.", details: { phase: result.phase },
        requestId: job.context.requestId, jobId: result.id, actorId: job.owner,
      });
    }
  } catch (error) {
    if (!terminal(job.state.status)) {
      job.state.status = job.controller.signal.aborted ? "cancelled" : "failed";
      job.state.phase = "finished";
      job.state.error ??= importErrorMessage(error);
      job.state.errorCode ??= importErrorCode(error);
      await persist(job);
    }
    if (job.state.status === "failed" && job.state.errorCode !== "CHECKPOINT_FAILED") {
      await systemLog(job.context, {
        level: "error", source: "story-import", code: job.state.errorCode ?? "IMPORT_FAILED",
        message: job.state.error ?? "Phiên import thất bại.", details: { phase: job.state.phase, cause: safeErrorDiagnostic(error) },
        requestId: job.context.requestId, jobId: job.state.id, actorId: job.owner,
      });
    }
  } finally {
    job.running = false;
  }
}
