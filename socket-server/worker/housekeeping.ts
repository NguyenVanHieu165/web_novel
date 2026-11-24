import type { Pool } from "mariadb";
import { safeJobErrorDetails } from "../jobs/errors";

export const CHAPTER_VIEW_RETENTION_DAYS = 90;
const CHAPTER_VIEW_ACTION = "CHAPTER_VIEW";
const HOUSEKEEPING_INTERVAL_MS = 24 * 60 * 60 * 1000;

function wait(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, delayMs);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

export async function cleanupExpiredChapterViewLogs(pool: Pool, now = new Date()) {
  const cutoff = new Date(now.getTime() - CHAPTER_VIEW_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await pool.query<{ affectedRows?: number }>(
    "DELETE FROM nhat_ky_he_thong WHERE nguon = ? AND created_at < ?",
    [CHAPTER_VIEW_ACTION, cutoff],
  );
  return Number(result.affectedRows ?? 0);
}

export async function runWorkerHousekeeping(pool: Pool, signal: AbortSignal) {
  while (!signal.aborted) {
    try {
      const deleted = await cleanupExpiredChapterViewLogs(pool);
      if (deleted > 0) {
        console.info("[background-worker]", { event: "chapter_view_logs_pruned", deleted });
      }
    } catch (error) {
      console.error("[background-worker]", {
        event: "housekeeping_failed",
        ...safeJobErrorDetails(error),
      });
    }
    await wait(HOUSEKEEPING_INTERVAL_MS, signal);
  }
}
