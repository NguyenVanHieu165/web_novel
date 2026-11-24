import "server-only";

import type { BackgroundJob, PrismaClient } from "@/app/generated/prisma/client";
import { enqueueBackgroundJob, getOwnedBackgroundJob, requestBackgroundJobCancellation } from "@/lib/server/background-jobs";
import { prisma } from "@/lib/prisma";
import { ImportSourceError, type ImportJob, type ImportOptions } from "@/lib/scraper/types";
import { createInitialImportState } from "@/lib/scraper/state";
import { importNovelJobPayloadSchema, importNovelResultSchema } from "@/schemas/background-job.schema";
import type { ImportNovelJobPayload } from "@/schemas/background-job.schema";

const ACTIVE_JOB_STATUS_LIST = ["queued", "running", "retry", "cancel_requested"] as const;
const ACTIVE_JOB_STATUSES = new Set<string>(ACTIVE_JOB_STATUS_LIST);
const LOOKBACK_MS = 24 * 60 * 60 * 1_000;

function normalizedSource(raw: string) {
  const url = new URL(raw);
  url.hash = "";
  return url;
}

function importOptions(payload: ImportNovelJobPayload): ImportOptions {
  return {
    url: payload.url,
    ...(payload.maxChapters === undefined ? {} : { maxChapters: payload.maxChapters }),
    downloadImages: payload.downloadImages,
    skipExisting: payload.skipExisting,
    skipLocked: payload.skipLocked,
  };
}

export async function assertImportSourceAvailable(
  options: ImportOptions,
  db: PrismaClient = prisma,
) {
  const requested = normalizedSource(options.url);
  const recent = await db.backgroundJob.findMany({
    where: {
      type: "IMPORT_NOVEL",
      OR: [
        { status: { in: [...ACTIVE_JOB_STATUS_LIST] } },
        { createdAt: { gte: new Date(Date.now() - LOOKBACK_MS) } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { status: true, payload: true, result: true },
  });

  let retryAt = 0;
  for (const job of recent) {
    const payload = importNovelJobPayloadSchema.safeParse(job.payload);
    if (!payload.success) continue;
    const source = normalizedSource(payload.data.url);
    if (source.href === requested.href && ACTIVE_JOB_STATUSES.has(job.status)) {
      throw new ImportSourceError("Đã có phiên import URL này đang chờ hoặc đang chạy.", "JOB_BUSY");
    }
    if (source.hostname !== requested.hostname) continue;
    const result = importNovelResultSchema.safeParse(job.result);
    if (result.success && result.data.retryAt) retryAt = Math.max(retryAt, result.data.retryAt);
  }

  if (retryAt > Date.now()) {
    throw new ImportSourceError(
      `Nguồn vẫn yêu cầu chờ ít nhất ${Math.ceil((retryAt - Date.now()) / 1_000)} giây trước khi tạo phiên mới.`,
      "RATE_LIMITED",
    );
  }
}

export async function enqueueImportNovelJob(
  ownerId: number,
  options: ImportOptions,
  requestId?: string,
  db: PrismaClient = prisma,
) {
  await assertImportSourceAvailable(options, db);
  return enqueueBackgroundJob({
    type: "IMPORT_NOVEL",
    payload: { ...options, userId: ownerId, ...(requestId ? { requestId } : {}) },
    ownerId,
    maxAttempts: 3,
  }, db);
}

export async function getOwnedImportNovelJob(id: string, ownerId: number, db: PrismaClient = prisma) {
  const job = await getOwnedBackgroundJob(id, ownerId, db);
  return job?.type === "IMPORT_NOVEL" ? job : null;
}

export async function requestImportNovelCancellation(id: string, ownerId: number, db: PrismaClient = prisma) {
  const owned = await getOwnedImportNovelJob(id, ownerId, db);
  if (!owned) return null;
  return requestBackgroundJobCancellation(id, ownerId, db);
}

export async function resumeImportNovelJob(
  id: string,
  ownerId: number,
  requestId?: string,
  db: PrismaClient = prisma,
) {
  const previous = await getOwnedImportNovelJob(id, ownerId, db);
  if (!previous) return null;
  if (ACTIVE_JOB_STATUSES.has(previous.status)) {
    throw new ImportSourceError("Phiên này vẫn đang chờ hoặc đang chạy.", "JOB_BUSY");
  }
  const payload = importNovelJobPayloadSchema.safeParse(previous.payload);
  if (!payload.success) throw new ImportSourceError("Payload phiên import cũ không hợp lệ.", "CHECKPOINT_INVALID");
  return enqueueImportNovelJob(ownerId, { ...importOptions(payload.data), skipExisting: true }, requestId, db);
}

function invalidImportState(job: BackgroundJob): ImportJob {
  return {
    id: job.id,
    status: job.status === "cancelled" ? "cancelled" : "failed",
    phase: "finished",
    storyTitle: "Phiên import không hợp lệ",
    totalChapters: 0,
    processedChapters: 0,
    savedChapters: 0,
    skippedChapters: 0,
    lockedChapters: 0,
    failedChapters: 0,
    downloadedImages: 0,
    logs: [],
    error: "Worker không thể đọc payload hoặc kết quả của phiên import.",
    errorCode: "CHECKPOINT_INVALID",
  };
}

export function serializeImportNovelJob(job: BackgroundJob): ImportJob {
  const payload = importNovelJobPayloadSchema.safeParse(job.payload);
  if (!payload.success) return invalidImportState(job);
  const requestId = payload.data.requestId;
  const options = importOptions(payload.data);
  const parsedResult = importNovelResultSchema.safeParse(job.result);
  const state = parsedResult.success
    ? structuredClone(parsedResult.data)
    : createInitialImportState(job.id, options, requestId);
  state.id = job.id;
  state.options = options;
  state.sourceUrl = options.url;
  state.sourceHost = normalizedSource(options.url).hostname;
  state.requestId ??= requestId;

  switch (job.status) {
    case "queued":
    case "retry":
      state.status = "queued";
      state.phase = "metadata";
      break;
    case "running":
      state.status = "running";
      break;
    case "cancel_requested":
      state.status = "cancelling";
      break;
    case "cancelled":
      state.status = "cancelled";
      state.phase = "finished";
      break;
    case "failed":
      state.status = "failed";
      state.phase = "finished";
      state.error ??= "Background Worker không thể hoàn tất phiên import. Các chương đã lưu vẫn được giữ nguyên.";
      state.errorCode ??= "WORKER_FAILED";
      break;
    case "completed":
      if (!parsedResult.success) return invalidImportState(job);
      break;
    default:
      return invalidImportState(job);
  }
  return state;
}
