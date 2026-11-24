import type { Pool } from "mariadb";
import type { JobHandler } from "../types";
import { createImportNovelHandler } from "./import-novel";
import { handleNoopJob } from "./noop";

export const jobHandlers: ReadonlyMap<string, JobHandler> = new Map([
  ["system.noop", handleNoopJob],
]);

export function createJobHandlers(pool: Pool): ReadonlyMap<string, JobHandler> {
  return new Map([
    ...jobHandlers,
    ["IMPORT_NOVEL", createImportNovelHandler(pool)],
  ]);
}
