import { createHash, randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import { sourceClient } from "./network";
import { scrapeChapter, scrapeStory } from "./adapters";
import { chapterContent } from "./normalizer";
import { importErrorCode, importErrorMessage } from "./errors";
import { downloadImage, optionalImage } from "./media";
import { createImportStoryWithChapter, ensureImportDatabase, existingImportChapterNumbers, findImportStory, storeImportChapter } from "./storage";
import { checkpointStore } from "./checkpoints";
import { databaseCheckpointStore } from "./database-checkpoints";
import { ImportSourceError, SourceBlockedError, SourceLockedError, SourceRateLimitError, terminal, type ImportJob, type ImportOptions } from "./types";
import { safeErrorDiagnostic } from "../server/system-log-sanitizer";

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
  client: ReturnType<typeof sourceClient>; budgetMs: number;
};
export async function runJob(id: string, overrides: Partial<RunServices> = {}) {
  const job = jobs.get(id); if (!job || terminal(job.state.status) || job.running) return;
  job.running = true;
  const { state, options, controller } = job;
  const updateIssue = (error: unknown, chapter?: number) => {
    const issue = { chapter, code: importErrorCode(error), reason: importErrorMessage(error).slice(0, 1200) };
    state.issues ??= []; state.issues.push(issue); if (state.issues.length > 50) state.issues.shift();
    log(job, `${chapter == null ? "Nguồn" : `Chương ${chapter}`}: ${issue.reason}`);
  };
  let workingPhase: ImportJob["phase"] = "metadata";
  const client = overrides.client ?? sourceClient(controller.signal, {
    waiting(retryAt, reason) {
      if (controller.signal.aborted) return;
      state.phase = "waiting"; state.retryAt = Math.max(state.retryAt ?? 0, retryAt); log(job, reason);
      void persist(job).catch(error => { state.error = importErrorMessage(error); state.errorCode = importErrorCode(error); controller.abort(error); });
    },
    resumed() { if (state.phase === "waiting") { state.phase = workingPhase; state.retryAt = undefined; log(job, "Đã hết thời gian chờ, đang tiếp tục."); } },
  }, undefined, options.url);
  const services = { db: prisma, scrapeStory, scrapeChapter, createStory: createImportStoryWithChapter, storeChapter: storeImportChapter, findStory: findImportStory, budgetMs: process.env.VERCEL ? 40_000 : 240_000, ...overrides, client };
  const db = services.db;
  let heartbeatWork = Promise.resolve();
  const heartbeat = job.store.shared ? setInterval(() => {
    heartbeatWork = heartbeatWork.then(async () => {
      if (terminal(state.status)) return;
      const saved = await job.store.read(id, job.owner);
      if (terminal(state.status)) return;
      if (saved?.state.status === "cancelling" && !controller.signal.aborted) {
        state.status = "cancelling"; controller.abort(new Error("Admin hủy import."));
      }
      if (!controller.signal.aborted) await persist(job);
    }).catch(error => {
      state.error = importErrorMessage(error); state.errorCode = importErrorCode(error); controller.abort(error);
    });
  }, 2000) : undefined;
  const budget = setTimeout(() => {
    state.errorCode = "TIME_BUDGET"; state.error = "Đã lưu tiến độ trước giới hạn thời gian chạy. Bấm tiếp tục để lấy các chương còn thiếu.";
    controller.abort(new Error("TIME_BUDGET"));
  }, services.budgetMs);
  let storyId: number | undefined;
  try {
    controller.signal.throwIfAborted(); state.status = "running"; state.phase = "metadata";
    await ensureImportDatabase(db); log(job, "Đã xác nhận database web_truyen. Đang đọc thông tin và toàn bộ mục lục…");
    state.phase = workingPhase = "catalogue"; await persist(job);
    const story = await services.scrapeStory(options.url, client, options.maxChapters);
    story.slug = story.slug.slice(0, 220) || `truyen-${createHash("sha256").update(options.url).digest("hex").slice(0, 16)}`;
    if (!story.chapters.length) throw new ImportSourceError("Không tìm thấy liên kết chương công khai. Nguồn có thể cần adapter riêng.", "NO_CHAPTERS");
    state.storyTitle = story.title.slice(0, 255); state.totalChapters = story.chapters.length; state.sourceName = story.sourceName;
    state.catalogueComplete = story.catalogueComplete; state.sourceTotalChapters = story.sourceTotalChapters;
    state.warning = story.warnings?.join(" ").slice(0, 3000);
    if (!options.maxChapters && story.catalogueComplete !== true) state.warning = [state.warning, "Chưa xác nhận mục lục chứa toàn bộ chương của nguồn; kết quả sẽ được đánh dấu một phần."].filter(Boolean).join(" ");
    let local = await services.findStory(db, story, options.url);
    state.cover = local?.anhBia || undefined; storyId = local?.idTruyen; state.storyId = storyId; state.storySlug = local?.slug;
    const existing = local ? await existingImportChapterNumbers(db, local.idTruyen) : new Set<number>();
    const counted = () => { state.downloadedImages++; };
    let missingImages = false;
    let cursor = 0; state.phase = workingPhase = "chapters"; await persist(job);
    async function bodyFor(index: number, slug: string) {
      const ref = story.chapters[index];
      if (options.skipExisting && existing.has(ref.number)) { state.skippedChapters++; return null; }
      const html = await services.scrapeChapter(ref, client);
      const content = await chapterContent(html, async (src, alt) => {
        if (!options.downloadImages) return null;
        const url = await optionalImage(() => downloadImage(src, ref.url, `chapters/${slug}`, client, counted), () => {
          missingImages = true; updateIssue(new ImportSourceError("Không tải được một ảnh minh họa. Đã giữ phần chữ; có thể cập nhật lại chương khi ảnh nguồn hoạt động.", "IMAGE_FAILED"), ref.number);
        });
        if (!url) return null;
        return `<img src="${url}" alt="${alt.replace(/[<>"&]/g, "")}" />`;
      });
      if (content.length < 50 && !content.includes('<img src="')) throw new ImportSourceError("Nội dung quá ngắn hoặc không nhận diện được toàn văn; không lưu bản xem thử.", "INCOMPLETE_CONTENT");
      return content;
    }
    async function failed(error: unknown, number: number, chapterIndex: number) {
      if (controller.signal.aborted) return;
      console.error("[import-chapter-error]", chapterIndex, error);
      updateIssue(error, number);
      if (error instanceof SourceBlockedError) {
        state.error = importErrorMessage(error); state.errorCode = importErrorCode(error);
        if (error instanceof SourceRateLimitError) state.retryAt = Math.max(state.retryAt ?? 0, error.retryAt);
        controller.abort(error); return;
      }
      if (error instanceof SourceLockedError) { state.lockedChapters++; state.skippedChapters++; if (!options.skipLocked) { state.error = error.message; state.errorCode = "SOURCE_LOCKED"; controller.abort(error); } }
      else state.failedChapters++;
    }
    while (!local && cursor < story.chapters.length && !controller.signal.aborted) {
      const index = cursor++, ref = story.chapters[index];
      try {
        const content = await bodyFor(index, story.slug); if (!content) continue;
        const cover = story.cover ? await optionalImage(() => downloadImage(story.cover!, options.url, "covers", client, counted), () => log(job, "Không tải được bìa nguồn; nội dung vẫn được nhập.")) : null;
        controller.signal.throwIfAborted();
        local = await services.createStory(db, story, options.url, cover || "", ref, content);
        state.cover = cover || undefined; storyId = local.idTruyen; state.storyId = storyId; state.storySlug = local.slug; state.savedChapters++;
        log(job, `Đã lưu chương ${ref.number}.`);
      } catch (error) { await failed(error, ref.number, index); }
      finally { state.processedChapters++; await persist(job); }
    }
    if (local && !controller.signal.aborted) {
      const target = local;
      log(job, `${story.title}: ${state.totalChapters} chương trong phạm vi import${options.maxChapters ? ` (giới hạn ${options.maxChapters})` : " (toàn bộ mục lục tìm thấy)"}.`);
      const workers = await Promise.allSettled(Array.from({ length: CHAPTER_CONCURRENCY }, async () => {
        try {
        while (cursor < story.chapters.length && !controller.signal.aborted) {
          const index = cursor++, ref = story.chapters[index];
          try {
            const content = await bodyFor(index, target.slug); controller.signal.throwIfAborted();
            if (content) {
              if (await services.storeChapter(db, target.idTruyen, ref, content, options.skipExisting)) { state.savedChapters++; log(job, `Đã lưu chương ${ref.number}.`); }
              else state.skippedChapters++;
            }
          } catch (error) { await failed(error, ref.number, index); }
          finally { state.processedChapters++; await persist(job); }
        }
        } catch (error) {
          // A coordinator failure must stop siblings before the job becomes terminal.
          state.error = importErrorMessage(error); state.errorCode = importErrorCode(error);
          controller.abort(error); throw error;
        }
      }));
      const rejected = workers.find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (rejected) throw rejected.reason;
    }
    if (controller.signal.aborted) state.status = state.errorCode === "TIME_BUDGET" ? "interrupted" : state.error ? "failed" : "cancelled";
    else if (!local) throw new ImportSourceError("Không có chương toàn văn đọc được. Không tạo truyện rỗng; xem lý do từng chương trong nhật ký.", "NO_READABLE_CHAPTERS");
    else state.status = state.failedChapters || missingImages || !options.maxChapters && story.catalogueComplete !== true ? "partial" : "completed";
  } catch (error) {
    state.status = controller.signal.aborted ? state.errorCode === "TIME_BUDGET" ? "interrupted" : state.error ? "failed" : "cancelled" : "failed";
    if (state.status === "failed") { state.error = importErrorMessage(error); state.errorCode = importErrorCode(error); if (error instanceof SourceRateLimitError) state.retryAt = Math.max(state.retryAt ?? 0, error.retryAt); updateIssue(error); }
    if (state.status === "failed" && state.errorCode !== "CHECKPOINT_FAILED") await systemLog(job.context, {
      level: "error", source: "story-import", code: state.errorCode ?? "IMPORT_FAILED",
      message: state.error ?? "Phiên import thất bại.", details: { phase: state.phase, cause: safeErrorDiagnostic(error) },
      requestId: job.context.requestId, jobId: state.id, actorId: job.owner,
    });
    if (state.storyTitle === "Đang nhận diện truyện…") state.storyTitle = `Nguồn: ${new URL(options.url).hostname}`;
  } finally {
    clearTimeout(budget); clearInterval(heartbeat); await heartbeatWork; state.phase = "finished";
    if (storyId) {
      try { const count = await db.chuong.count({ where: { idTruyen: storyId } }); await db.truyen.update({ where: { idTruyen: storyId }, data: { soChuong: count } }); }
      catch { state.status = "partial"; state.errorCode = "STATISTICS_FAILED"; state.error = "Chương đã lưu nhưng chưa cập nhật được thống kê truyện."; }
    }
    log(job, `Kết thúc: ${state.savedChapters} chương lưu, ${state.skippedChapters} bỏ qua, ${state.failedChapters} lỗi chương.`);
    try { await persist(job); } finally { job.running = false; }
  }
}
