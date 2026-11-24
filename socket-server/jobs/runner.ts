import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { PermanentJobError, safeJobError } from "./errors";
import type { JobRepository } from "./repository";
import type { ClaimedJob, JobHandler } from "./types";

type RunnerConfig = {
  concurrency: number;
  heartbeatMs: number;
  pollMs: number;
  idlePollMs: number;
};

function wait(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, delayMs);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

export class JobRunner {
  private readonly stopController = new AbortController();
  private readonly workerPrefix = `${hostname() || "render"}:${process.pid}:${randomUUID().slice(0, 8)}`;
  private lastRecoveryAt = 0;

  constructor(
    private readonly repository: JobRepository,
    private readonly handlers: ReadonlyMap<string, JobHandler>,
    private readonly config: RunnerConfig,
  ) {}

  async start() {
    console.info("[background-worker]", { event: "started", concurrency: this.config.concurrency });
    await Promise.all(Array.from({ length: this.config.concurrency }, (_, slot) => this.runLoop(slot)));
    console.info("[background-worker]", { event: "stopped" });
  }

  stop(reason = "Worker shutdown") {
    if (!this.stopController.signal.aborted) this.stopController.abort(new Error(reason));
  }

  async runOnce(workerId = `${this.workerPrefix}:test`) {
    await this.recoverIfDue();
    const job = await this.repository.claimNext(workerId);
    if (!job) return false;
    await this.execute(job, workerId);
    return true;
  }

  private async runLoop(slot: number) {
    const workerId = `${this.workerPrefix}:${slot}`;
    while (!this.stopController.signal.aborted) {
      try {
        const worked = await this.runOnce(workerId);
        await wait(worked ? this.config.pollMs : this.config.idlePollMs, this.stopController.signal);
      } catch (error) {
        if (this.stopController.signal.aborted) break;
        console.error("[background-worker]", { event: "loop-error", error: safeJobError(error) });
        try { await wait(this.config.idlePollMs, this.stopController.signal); }
        catch { break; }
      }
    }
  }

  private async recoverIfDue() {
    const now = Date.now();
    if (now - this.lastRecoveryAt < 60_000) return;
    this.lastRecoveryAt = now;
    const recovered = await this.repository.recoverExpiredJobs();
    if (recovered.cancelled || recovered.failed) {
      console.info("[background-worker]", { event: "recovered", ...recovered });
    }
  }

  private async execute(job: ClaimedJob, workerId: string) {
    const handler = this.handlers.get(job.type);
    if (!handler) {
      await this.repository.fail(job, workerId, new PermanentJobError(`Unsupported job type: ${job.type}`), false);
      return;
    }

    const jobController = new AbortController();
    const heartbeatStop = new AbortController();
    let cancelRequested = false;
    let leaseLost = false;
    let heartbeatError: unknown;
    const stopJob = () => jobController.abort(this.stopController.signal.reason);
    this.stopController.signal.addEventListener("abort", stopJob, { once: true });

    const heartbeat = (async () => {
      while (!heartbeatStop.signal.aborted) {
        try { await wait(this.config.heartbeatMs, heartbeatStop.signal); }
        catch { break; }
        try {
          const state = await this.repository.heartbeat(job.id, workerId);
          if (state === "cancel_requested") {
            cancelRequested = true;
            jobController.abort(new Error("Job cancellation requested"));
            break;
          }
          if (state === "lost") {
            leaseLost = true;
            jobController.abort(new Error("Background job lease was lost"));
            break;
          }
        } catch (error) {
          heartbeatError = error;
          jobController.abort(error);
          break;
        }
      }
    })();

    try {
      console.info("[background-worker]", { event: "claimed", jobId: job.id, type: job.type, attempt: job.attempts });
      const result = await handler(job.payload, {
        job,
        signal: jobController.signal,
        reportProgress: (progress) => this.repository.updateProgress(job.id, workerId, progress),
      });
      const state = await this.repository.heartbeat(job.id, workerId);
      if (state === "lost") {
        leaseLost = true;
        return;
      }
      if (state === "cancel_requested") {
        cancelRequested = true;
        await this.repository.cancel(job.id, workerId);
        return;
      }
      await this.repository.complete(job.id, workerId, result);
      console.info("[background-worker]", { event: "completed", jobId: job.id, type: job.type });
    } catch (error) {
      if (leaseLost) return;
      const state = await this.repository.controlStatus(job.id, workerId).catch(() => "lost" as const);
      if (cancelRequested || state === "cancel_requested") {
        await this.repository.cancel(job.id, workerId);
        console.info("[background-worker]", { event: "cancelled", jobId: job.id, type: job.type });
        return;
      }
      if (state === "lost") return;
      const cause = heartbeatError ?? error;
      const retryable = !(cause instanceof PermanentJobError);
      const outcome = await this.repository.fail(job, workerId, cause, retryable);
      console.error("[background-worker]", { event: outcome, jobId: job.id, type: job.type, error: safeJobError(cause) });
    } finally {
      heartbeatStop.abort();
      await heartbeat;
      this.stopController.signal.removeEventListener("abort", stopJob);
    }
  }
}
