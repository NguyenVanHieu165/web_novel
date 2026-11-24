import mariadb, { type Pool, type PoolConfig } from "mariadb";
import type { WorkerConfig } from "./config";

function parseDatabaseUrl(rawUrl: string) {
  const parsed = new URL(rawUrl.replace(/^(mysql|mysql2|mariadb):/iu, "http:"));
  return {
    host: decodeURIComponent(parsed.hostname),
    port: parsed.port ? Number(parsed.port) : undefined,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//u, "")),
    sslAccept: parsed.searchParams.get("sslaccept"),
    sslMode: parsed.searchParams.get("sslmode"),
  };
}

export function createJobPool(config: WorkerConfig["database"]): Pool {
  const parsed = config.url ? parseDatabaseUrl(config.url) : undefined;
  const host = config.host || parsed?.host || "127.0.0.1";
  const database = config.name || parsed?.database;
  const user = config.user || parsed?.user;
  if (!database || !user) throw new Error("Database name and user are required");

  const explicitlyDisabled = config.ssl === "false" || config.ssl === "0";
  const requiresTls = host.includes("tidbcloud.com") || !explicitlyDisabled && (
    config.ssl === "true" || config.ssl === "1" || parsed?.sslAccept === "strict" ||
    parsed?.sslMode?.toUpperCase().startsWith("VERIFY") === true || parsed?.sslMode?.toUpperCase() === "REQUIRED"
  );
  const options: PoolConfig = {
    host,
    port: config.port || parsed?.port || (host.includes("tidbcloud.com") ? 4_000 : 3_306),
    user,
    password: config.password ?? parsed?.password,
    database,
    connectionLimit: config.connectionLimit,
    connectTimeout: config.connectTimeout,
    acquireTimeout: config.connectTimeout,
    idleTimeout: 60,
    minimumIdle: 0,
    multipleStatements: false,
    bigIntAsNumber: true,
    insertIdAsNumber: true,
    timezone: "Z",
    ...(requiresTls ? {
      ssl: {
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
        ...(config.sslCa ? { ca: config.sslCa } : {}),
      },
    } : {}),
  };
  return mariadb.createPool(options);
}
