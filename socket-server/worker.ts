import dotenv from "dotenv";
import { loadWorkerConfig } from "./jobs/config";
import { createJobPool } from "./jobs/database";
import { jobHandlers } from "./jobs/handlers";
import { JobRepository } from "./jobs/repository";
import { JobRunner } from "./jobs/runner";

dotenv.config();
dotenv.config({ path: "../.env" });

async function main() {
  const config = loadWorkerConfig();
  const pool = createJobPool(config.database);
  const repository = new JobRepository(pool, config.leaseMs);
  const runner = new JobRunner(repository, jobHandlers, config);
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info("[background-worker]", { event: "shutdown", signal });
    runner.stop(signal);
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));

  try {
    await pool.query("SELECT 1");
    await runner.start();
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error("[background-worker]", { event: "fatal", error: error instanceof Error ? error.message : "Unknown error" });
  process.exitCode = 1;
});
