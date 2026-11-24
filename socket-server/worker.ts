import dotenv from "dotenv";
import type { Pool, PoolConnection } from "mariadb";
import { loadWorkerConfig } from "./jobs/config";
import { createJobPool } from "./jobs/database";
import { safeJobErrorDetails } from "./jobs/errors";
import { createJobHandlers } from "./jobs/handlers";
import { JobRepository } from "./jobs/repository";
import { JobRunner } from "./jobs/runner";
import { runWorkerHousekeeping } from "./worker/housekeeping";

dotenv.config();
dotenv.config({ path: "../.env" });

async function verifyDatabaseConnection(pool: Pool) {
  let connection: PoolConnection | undefined;
  try {
    connection = await pool.getConnection();
    await connection.query("SELECT 1");
  } catch (error) {
    console.error("[background-worker]", {
      event: "database_connection_failed",
      ...safeJobErrorDetails(error),
    });
    throw error;
  } finally {
    connection?.release();
  }
}

async function main() {
  const config = loadWorkerConfig();
  const pool = createJobPool(config.database);
  const repository = new JobRepository(pool, config.leaseMs);
  const runner = new JobRunner(repository, createJobHandlers(pool), config);
  const housekeepingController = new AbortController();
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info("[background-worker]", { event: "shutdown", signal });
    housekeepingController.abort();
    runner.stop(signal);
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));

  try {
    await verifyDatabaseConnection(pool);
    const housekeeping = runWorkerHousekeeping(pool, housekeepingController.signal);
    try {
      await runner.start();
    } finally {
      housekeepingController.abort();
      await housekeeping;
    }
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error("[background-worker]", { event: "fatal", ...safeJobErrorDetails(error) });
  process.exitCode = 1;
});
