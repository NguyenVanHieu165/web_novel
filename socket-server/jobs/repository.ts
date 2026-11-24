import type { Pool, UpsertResult } from "mariadb";
import { safeJobError } from "./errors";
import type { ClaimedJob, JobControlStatus, WorkerJobStatus } from "./types";

type CandidateRow = { id: string };
type ControlRow = { status: WorkerJobStatus; lockedBy: string | null };
type DatabaseJobRow = {
  id: string;
  type: string;
  status: WorkerJobStatus;
  payload: unknown;
  progress: number;
  priority: number;
  attempts: number;
  maxAttempts: number;
  ownerId: number | null;
  runAt: Date | string;
  leaseExpiresAt: Date | string;
};

function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); }
  catch { return value; }
}

function dateValue(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function claimedJob(row: DatabaseJobRow): ClaimedJob {
  return {
    id: row.id,
    type: row.type,
    status: "running",
    payload: jsonValue(row.payload),
    progress: Number(row.progress),
    priority: Number(row.priority),
    attempts: Number(row.attempts),
    maxAttempts: Number(row.maxAttempts),
    ownerId: row.ownerId == null ? null : Number(row.ownerId),
    runAt: dateValue(row.runAt),
    leaseExpiresAt: dateValue(row.leaseExpiresAt),
  };
}

export class JobRepository {
  constructor(private readonly pool: Pool, private readonly leaseMs: number) {}

  async recoverExpiredJobs() {
    const cancelled = await this.pool.query<UpsertResult>(`
      UPDATE background_jobs
      SET status = 'cancelled', finished_at = CURRENT_TIMESTAMP(3),
          locked_by = NULL, lease_expires_at = NULL, heartbeat_at = NULL
      WHERE status = 'cancel_requested'
        AND (lease_expires_at IS NULL OR lease_expires_at < CURRENT_TIMESTAMP(3))
    `);
    const failed = await this.pool.query<UpsertResult>(`
      UPDATE background_jobs
      SET status = 'failed', finished_at = CURRENT_TIMESTAMP(3),
          last_error = COALESCE(last_error, 'Worker lease expired after maximum attempts.'),
          locked_by = NULL, lease_expires_at = NULL, heartbeat_at = NULL
      WHERE status = 'running'
        AND lease_expires_at < CURRENT_TIMESTAMP(3)
        AND attempts >= max_attempts
    `);
    return { cancelled: cancelled.affectedRows, failed: failed.affectedRows };
  }

  async claimNext(workerId: string): Promise<ClaimedJob | null> {
    const candidates = await this.pool.query<CandidateRow[]>(`
      SELECT id
      FROM background_jobs
      WHERE attempts < max_attempts
        AND (
          (status IN ('queued', 'retry') AND run_at <= CURRENT_TIMESTAMP(3))
          OR (status = 'running' AND lease_expires_at < CURRENT_TIMESTAMP(3))
        )
      ORDER BY priority DESC, run_at ASC, created_at ASC
      LIMIT 8
    `);

    for (const candidate of candidates) {
      const leaseExpiresAt = new Date(Date.now() + this.leaseMs);
      const claimed = await this.pool.query<UpsertResult>(`
        UPDATE background_jobs
        SET status = 'running', locked_by = ?, lease_expires_at = ?,
            heartbeat_at = CURRENT_TIMESTAMP(3), started_at = COALESCE(started_at, CURRENT_TIMESTAMP(3)),
            attempts = attempts + 1
        WHERE id = ?
          AND attempts < max_attempts
          AND (
            (status IN ('queued', 'retry') AND run_at <= CURRENT_TIMESTAMP(3))
            OR (status = 'running' AND lease_expires_at < CURRENT_TIMESTAMP(3))
          )
      `, [workerId, leaseExpiresAt, candidate.id]);
      if (claimed.affectedRows !== 1) continue;

      const rows = await this.pool.query<DatabaseJobRow[]>(`
        SELECT id, type, status, payload, progress, priority, attempts,
               max_attempts AS maxAttempts, owner_id AS ownerId,
               run_at AS runAt, lease_expires_at AS leaseExpiresAt
        FROM background_jobs
        WHERE id = ? AND status = 'running' AND locked_by = ?
        LIMIT 1
      `, [candidate.id, workerId]);
      if (rows[0]) return claimedJob(rows[0]);
    }
    return null;
  }

  async heartbeat(jobId: string, workerId: string): Promise<JobControlStatus> {
    const leaseExpiresAt = new Date(Date.now() + this.leaseMs);
    const updated = await this.pool.query<UpsertResult>(`
      UPDATE background_jobs
      SET heartbeat_at = CURRENT_TIMESTAMP(3), lease_expires_at = ?
      WHERE id = ? AND locked_by = ? AND status IN ('running', 'cancel_requested')
    `, [leaseExpiresAt, jobId, workerId]);
    if (updated.affectedRows !== 1) return "lost";
    const rows = await this.pool.query<ControlRow[]>(`
      SELECT status, locked_by AS lockedBy FROM background_jobs WHERE id = ? LIMIT 1
    `, [jobId]);
    if (!rows[0] || rows[0].lockedBy !== workerId) return "lost";
    return rows[0].status === "cancel_requested" ? "cancel_requested" : "running";
  }

  async controlStatus(jobId: string, workerId: string): Promise<JobControlStatus> {
    const rows = await this.pool.query<ControlRow[]>(`
      SELECT status, locked_by AS lockedBy FROM background_jobs WHERE id = ? LIMIT 1
    `, [jobId]);
    if (!rows[0] || rows[0].lockedBy !== workerId) return "lost";
    return rows[0].status === "cancel_requested" ? "cancel_requested" : rows[0].status === "running" ? "running" : "lost";
  }

  async updateProgress(jobId: string, workerId: string, progress: number) {
    const safeProgress = Math.max(0, Math.min(100, Math.trunc(progress)));
    const result = await this.pool.query<UpsertResult>(`
      UPDATE background_jobs SET progress = ?
      WHERE id = ? AND locked_by = ? AND status = 'running'
    `, [safeProgress, jobId, workerId]);
    if (result.affectedRows !== 1) throw new Error("Background job lease was lost");
  }

  async complete(jobId: string, workerId: string, result: unknown) {
    const updated = await this.pool.query<UpsertResult>(`
      UPDATE background_jobs
      SET status = 'completed', progress = 100, result = ?, last_error = NULL,
          finished_at = CURRENT_TIMESTAMP(3), locked_by = NULL,
          lease_expires_at = NULL, heartbeat_at = NULL
      WHERE id = ? AND locked_by = ? AND status = 'running'
    `, [JSON.stringify(result ?? null), jobId, workerId]);
    return updated.affectedRows === 1;
  }

  async cancel(jobId: string, workerId: string) {
    const updated = await this.pool.query<UpsertResult>(`
      UPDATE background_jobs
      SET status = 'cancelled', finished_at = CURRENT_TIMESTAMP(3),
          locked_by = NULL, lease_expires_at = NULL, heartbeat_at = NULL
      WHERE id = ? AND locked_by = ? AND status IN ('running', 'cancel_requested')
    `, [jobId, workerId]);
    return updated.affectedRows === 1;
  }

  async fail(job: ClaimedJob, workerId: string, error: unknown, retryable: boolean) {
    const message = safeJobError(error);
    if (retryable && job.attempts < job.maxAttempts) {
      const exponentialMs = Math.min(5 * 60_000, 5_000 * 2 ** Math.max(0, job.attempts - 1));
      const jitterMs = Math.floor(Math.random() * 1_000);
      const runAt = new Date(Date.now() + exponentialMs + jitterMs);
      const updated = await this.pool.query<UpsertResult>(`
        UPDATE background_jobs
        SET status = 'retry', run_at = ?, last_error = ?,
            locked_by = NULL, lease_expires_at = NULL, heartbeat_at = NULL
        WHERE id = ? AND locked_by = ? AND status = 'running'
      `, [runAt, message, job.id, workerId]);
      return updated.affectedRows === 1 ? "retry" : "lost";
    }
    const updated = await this.pool.query<UpsertResult>(`
      UPDATE background_jobs
      SET status = 'failed', last_error = ?, finished_at = CURRENT_TIMESTAMP(3),
          locked_by = NULL, lease_expires_at = NULL, heartbeat_at = NULL
      WHERE id = ? AND locked_by = ? AND status = 'running'
    `, [message, job.id, workerId]);
    return updated.affectedRows === 1 ? "failed" : "lost";
  }
}
