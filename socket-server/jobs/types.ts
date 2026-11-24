export type WorkerJobStatus =
  | "queued"
  | "running"
  | "retry"
  | "cancel_requested"
  | "completed"
  | "failed"
  | "cancelled";

export type ClaimedJob = {
  id: string;
  type: string;
  status: "running";
  payload: unknown;
  progress: number;
  priority: number;
  attempts: number;
  maxAttempts: number;
  ownerId: number | null;
  runAt: Date;
  leaseExpiresAt: Date;
};

export type JobHandlerContext = {
  job: ClaimedJob;
  signal: AbortSignal;
  reportProgress(progress: number): Promise<void>;
};

export type JobHandler = (payload: unknown, context: JobHandlerContext) => Promise<unknown>;

export type JobControlStatus = "running" | "cancel_requested" | "lost";
