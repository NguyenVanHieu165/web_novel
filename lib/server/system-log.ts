import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { safeErrorDiagnostic, sanitizeSystemLogDetails } from "@/lib/server/system-log-sanitizer";
import { z } from "zod";

export const systemLogLevelSchema = z.enum(["info", "warning", "error", "critical"]);
export type SystemLogLevel = z.infer<typeof systemLogLevelSchema>;

export const systemLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(10).max(100).default(50),
  level: systemLogLevelSchema.optional(),
  source: z.string().trim().max(80).optional().transform((value) => value || undefined),
  code: z.string().trim().max(80).optional().transform((value) => value || undefined),
  q: z.string().trim().max(120).optional().transform((value) => value || undefined),
});
export type SystemLogQuery = z.infer<typeof systemLogQuerySchema>;

export type SystemLogInput = {
  level: SystemLogLevel;
  source: string;
  code?: string;
  message: string;
  details?: unknown;
  requestId?: string;
  jobId?: string;
  actorId?: number;
};

function safeJson(value: unknown) {
  if (value === undefined) return null;
  const json = JSON.stringify(sanitizeSystemLogDetails(value));
  return json.length > 12_000
    ? JSON.stringify({ truncated: true, preview: json.slice(0, 10_000) })
    : json;
}

export async function writeSystemLog(input: SystemLogInput) {
  const data = {
    mucDo: input.level,
    nguon: input.source.slice(0, 80),
    maLoi: input.code?.slice(0, 80),
    thongDiep: input.message.replace(/\s+/gu, " ").trim().slice(0, 500),
    chiTiet: safeJson(input.details),
    requestId: input.requestId,
    jobId: input.jobId,
    idTaiKhoan: input.actorId,
  };
  try {
    return await prisma.nhatKyHeThong.create({ data, select: { idNhatKy: true } });
  } catch (error) {
    console.error("[system-log-write-failed]", {
      source: data.nguon,
      code: data.maLoi,
      requestId: data.requestId,
      jobId: data.jobId,
      cause: safeErrorDiagnostic(error),
    });
    return null;
  }
}

export async function listSystemLogs(query: SystemLogQuery) {
  const clauses: Prisma.NhatKyHeThongWhereInput[] = [];
  if (query.level) clauses.push({ mucDo: query.level });
  if (query.source) clauses.push({ nguon: query.source });
  if (query.code) clauses.push({ maLoi: query.code });
  if (query.q) {
    clauses.push({ OR: [
      { thongDiep: { contains: query.q } },
      { maLoi: { contains: query.q } },
      { requestId: { contains: query.q } },
      { jobId: { contains: query.q } },
    ] });
  }
  const where: Prisma.NhatKyHeThongWhereInput = clauses.length ? { AND: clauses } : {};
  const [items, total] = await Promise.all([
    prisma.nhatKyHeThong.findMany({
      where,
      select: {
        idNhatKy: true, mucDo: true, nguon: true, maLoi: true, thongDiep: true, chiTiet: true,
        requestId: true, jobId: true, createdAt: true,
        taiKhoan: { select: { idTaiKhoan: true, tenTaiKhoan: true } },
      },
      orderBy: [{ createdAt: "desc" }, { idNhatKy: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.nhatKyHeThong.count({ where }),
  ]);
  return {
    items: items.map((item) => ({ ...item, idNhatKy: item.idNhatKy.toString() })),
    meta: { page: query.page, limit: query.limit, total, totalPage: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

type DiagnosticCheck = "select" | "insert" | "update" | "json" | "delete";

export async function runCheckpointDatabaseDiagnostic(actorId: number, requestId: string) {
  const key = `diagnostic.checkpoint.${randomUUID()}`;
  const checks: Record<DiagnosticCheck, boolean> = { select: false, insert: false, update: false, json: false, delete: false };
  let step: DiagnosticCheck = "select";
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT khoa FROM cai_dat_he_thong WHERE khoa = ${key} LIMIT 1`;
      checks.select = true;

      step = "insert";
      await tx.$executeRaw`INSERT INTO cai_dat_he_thong (khoa, gia_tri, mo_ta)
        VALUES (${key}, ${JSON.stringify({ state: { status: "diagnostic" } })}, 'Kiểm tra quyền checkpoint')`;
      checks.insert = true;

      step = "update";
      await tx.$executeRaw`UPDATE cai_dat_he_thong
        SET gia_tri = ${JSON.stringify({ state: { status: "diagnostic-updated" } })}
        WHERE khoa = ${key}`;
      checks.update = true;

      step = "json";
      const rows = await tx.$queryRaw<Array<{ status: string | null }>>`
        SELECT JSON_UNQUOTE(JSON_EXTRACT(gia_tri, '$.state.status')) AS status
        FROM cai_dat_he_thong WHERE khoa = ${key} LIMIT 1`;
      if (rows[0]?.status !== "diagnostic-updated") throw new Error("Database JSON functions returned an unexpected result.");
      checks.json = true;

      step = "delete";
      await tx.$executeRaw`DELETE FROM cai_dat_he_thong WHERE khoa = ${key}`;
      checks.delete = true;
    });

    await writeSystemLog({
      level: "info", source: "database-diagnostic", code: "CHECKPOINT_DB_OK",
      message: "Kiểm tra database checkpoint thành công.", details: { checks }, requestId, actorId,
    });
    return { ok: true as const, checks };
  } catch (error) {
    const cause = safeErrorDiagnostic(error);
    await writeSystemLog({
      level: "critical", source: "database-diagnostic", code: "CHECKPOINT_DB_FAILED",
      message: `Kiểm tra database checkpoint thất bại tại bước ${step}.`,
      details: { failedStep: step, checks, cause }, requestId, actorId,
    });
    return { ok: false as const, failedStep: step, checks, cause };
  }
}
