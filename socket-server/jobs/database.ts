import mariadb, { type Pool, type PoolConfig } from "mariadb";
import type { WorkerConfig } from "./config";

function parseDatabaseUrl(rawUrl: string) {
  const parsed = new URL(rawUrl);
  const tlsParameters = new Set(["sslaccept", "ssl-mode", "sslmode", "ssl"]);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 4_000,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//u, ""),
    requiresTls: [...parsed.searchParams.keys()].some((name) => tlsParameters.has(name.toLowerCase())),
  };
}

export function buildJobPoolOptions(config: WorkerConfig["database"]): PoolConfig {
  const parsed = config.url ? parseDatabaseUrl(config.url) : undefined;
  const host = config.host || parsed?.host || "127.0.0.1";
  const database = config.name || parsed?.database;
  const user = config.user || parsed?.user;
  if (!database || !user) throw new Error("Database name and user are required");

  const isTiDbCloud = host.toLowerCase().endsWith("tidbcloud.com");
  const requiresTls = isTiDbCloud || parsed?.requiresTls === true || config.ssl === "true" || config.ssl === "1";
  const options: PoolConfig = {
    host,
    port: config.port || parsed?.port || (isTiDbCloud ? 4_000 : 3_306),
    user,
    password: config.password ?? parsed?.password,
    database,
    connectionLimit: config.connectionLimit || 3,
    acquireTimeout: 20_000,
    connectTimeout: config.connectTimeout || 15_000,
    idleTimeout: 60,
    minimumIdle: 0,
    multipleStatements: false,
    bigIntAsNumber: true,
    insertIdAsNumber: true,
    timezone: "Z",
    ...(requiresTls ? {
      ssl: {
        rejectUnauthorized: true,
        ...(config.sslCa ? { ca: config.sslCa } : {}),
      },
    } : {}),
  };
  return options;
}

export function createJobPool(config: WorkerConfig["database"]): Pool {
  return mariadb.createPool(buildJobPoolOptions(config));
}
