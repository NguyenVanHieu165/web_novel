export const backgroundJobTypes = ["system.noop", "IMPORT_NOVEL"] as const;
export type BackgroundJobType = (typeof backgroundJobTypes)[number];

export const backgroundJobStatuses = [
  "queued",
  "running",
  "retry",
  "cancel_requested",
  "completed",
  "failed",
  "cancelled",
] as const;
export type BackgroundJobStatus = (typeof backgroundJobStatuses)[number];

export const terminalBackgroundJobStatuses = new Set<BackgroundJobStatus>([
  "completed",
  "failed",
  "cancelled",
]);

export function isTerminalBackgroundJobStatus(status: string): status is BackgroundJobStatus {
  return terminalBackgroundJobStatuses.has(status as BackgroundJobStatus);
}
