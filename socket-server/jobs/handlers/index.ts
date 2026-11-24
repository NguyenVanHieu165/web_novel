import type { JobHandler } from "../types";
import { handleNoopJob } from "./noop";

export const jobHandlers: ReadonlyMap<string, JobHandler> = new Map([
  ["system.noop", handleNoopJob],
]);
