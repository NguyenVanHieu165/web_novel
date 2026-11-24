import { z } from "zod";

const optionalString = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().optional(),
);

const environmentSchema = z.object({
  DATABASE_URL: optionalString,
  DATABASE_HOST: optionalString,
  DATABASE_PORT: z.coerce.number().int().positive().max(65_535).optional(),
  DATABASE_USER: optionalString,
  DATABASE_PASSWORD: optionalString,
  DATABASE_NAME: optionalString,
  DATABASE_SSL: optionalString,
  DATABASE_SSL_CA: optionalString,
  DATABASE_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(10).default(3),
  DATABASE_CONNECT_TIMEOUT: z.coerce.number().int().min(1_000).max(60_000).default(15_000),
  JOB_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
  JOB_LEASE_MS: z.coerce.number().int().min(30_000).max(15 * 60_000).default(90_000),
  JOB_HEARTBEAT_MS: z.coerce.number().int().min(5_000).max(5 * 60_000).default(20_000),
  JOB_POLL_MS: z.coerce.number().int().min(500).max(60_000).default(5_000),
  JOB_IDLE_POLL_MS: z.coerce.number().int().min(1_000).max(5 * 60_000).default(15_000),
}).superRefine((value, context) => {
  if (!value.DATABASE_URL && !(value.DATABASE_HOST && value.DATABASE_USER && value.DATABASE_NAME)) {
    context.addIssue({ code: "custom", message: "DATABASE_URL hoặc bộ DATABASE_HOST/USER/NAME là bắt buộc." });
  }
  if (value.JOB_HEARTBEAT_MS * 2 >= value.JOB_LEASE_MS) {
    context.addIssue({ code: "custom", path: ["JOB_HEARTBEAT_MS"], message: "Heartbeat phải nhỏ hơn một nửa lease." });
  }
});

export type WorkerConfig = ReturnType<typeof loadWorkerConfig>;

export function loadWorkerConfig(environment: NodeJS.ProcessEnv = process.env) {
  const value = environmentSchema.parse(environment);
  return {
    database: {
      url: value.DATABASE_URL,
      host: value.DATABASE_HOST,
      port: value.DATABASE_PORT,
      user: value.DATABASE_USER,
      password: value.DATABASE_PASSWORD,
      name: value.DATABASE_NAME,
      ssl: value.DATABASE_SSL,
      sslCa: value.DATABASE_SSL_CA,
      connectionLimit: value.DATABASE_CONNECTION_LIMIT,
      connectTimeout: value.DATABASE_CONNECT_TIMEOUT,
    },
    concurrency: value.JOB_CONCURRENCY,
    leaseMs: value.JOB_LEASE_MS,
    heartbeatMs: value.JOB_HEARTBEAT_MS,
    pollMs: value.JOB_POLL_MS,
    idlePollMs: Math.max(value.JOB_IDLE_POLL_MS, value.JOB_POLL_MS),
  };
}
