import { z } from "zod";
import { PermanentJobError } from "../errors";
import type { JobHandler } from "../types";

const payloadSchema = z.object({
  message: z.string().trim().min(1).max(200),
  delayMs: z.number().int().min(0).max(30_000),
}).strict();

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

export const handleNoopJob: JobHandler = async (rawPayload, context) => {
  const parsed = payloadSchema.safeParse(rawPayload);
  if (!parsed.success) throw new PermanentJobError("Invalid system.noop payload");
  const payload = parsed.data;
  await context.reportProgress(10);
  await wait(payload.delayMs, context.signal);
  await context.reportProgress(90);
  return { message: payload.message };
};
