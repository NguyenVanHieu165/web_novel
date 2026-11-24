import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, type BackgroundJob, type PrismaClient } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { enqueueBackgroundJobSchema, type EnqueueBackgroundJobInput } from "@/schemas/background-job.schema";

function prismaErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

export async function enqueueBackgroundJob(
  input: EnqueueBackgroundJobInput,
  db: PrismaClient = prisma,
): Promise<{ job: BackgroundJob; created: boolean }> {
  const value = enqueueBackgroundJobSchema.parse(input);
  if (value.dedupeKey) {
    const existing = await db.backgroundJob.findUnique({ where: { dedupeKey: value.dedupeKey } });
    if (existing) return { job: existing, created: false };
  }

  const data: Prisma.BackgroundJobUncheckedCreateInput = {
    id: randomUUID(),
    type: value.type,
    status: "queued",
    payload: value.payload,
    priority: value.priority,
    maxAttempts: value.maxAttempts,
    runAt: value.runAt,
    dedupeKey: value.dedupeKey,
    ownerId: value.ownerId,
  };

  try {
    return { job: await db.backgroundJob.create({ data }), created: true };
  } catch (error) {
    if (value.dedupeKey && prismaErrorCode(error) === "P2002") {
      const existing = await db.backgroundJob.findUnique({ where: { dedupeKey: value.dedupeKey } });
      if (existing) return { job: existing, created: false };
    }
    throw error;
  }
}

export async function getOwnedBackgroundJob(id: string, ownerId: number, db: PrismaClient = prisma) {
  return db.backgroundJob.findFirst({ where: { id, ownerId } });
}

export async function requestBackgroundJobCancellation(id: string, ownerId: number, db: PrismaClient = prisma) {
  const now = new Date();
  const cancelled = await db.backgroundJob.updateMany({
    where: { id, ownerId, status: { in: ["queued", "retry"] } },
    data: {
      status: "cancelled",
      finishedAt: now,
      lockedBy: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
    },
  });
  if (!cancelled.count) {
    await db.backgroundJob.updateMany({
      where: { id, ownerId, status: "running" },
      data: { status: "cancel_requested" },
    });
  }
  return getOwnedBackgroundJob(id, ownerId, db);
}

export async function wakeBackgroundWorker(jobId: string, fetcher: typeof fetch = fetch) {
  const token = process.env.INTERNAL_SECRET_TOKEN;
  const base = process.env.SOCKET_SERVER_URL?.replace(/\/+$/u, "");
  if (!token || !base) return false;
  let url: URL;
  try { url = new URL(`${base}/api/internal/jobs/wake`); }
  catch { return false; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  try {
    const response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jobId }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(2_500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function serializeBackgroundJob(job: BackgroundJob) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    runAt: job.runAt,
    result: job.result,
    lastError: job.lastError,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
