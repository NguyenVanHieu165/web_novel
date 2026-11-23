const SENSITIVE_KEY = /(?:password|passwd|secret|token|authorization|cookie|credential|api[-_]?key|private[-_]?key)/iu;
const DATABASE_URL = /\b(?:mysql|mysql2|mariadb|postgres|postgresql):\/\/[^\s]+/giu;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/giu;
const SECRET_ASSIGNMENT = /\b(password|passwd|secret|token|authorization|cookie|credential|api[-_]?key)\s*[:=]\s*([^\s,;]+)/giu;
const DATABASE_USER = /'[^']+'@'[^']+'/gu;

function sanitizeString(value: string, maxLength = 1200) {
  return value
    .replace(DATABASE_URL, "[database-url-redacted]")
    .replace(BEARER_TOKEN, "Bearer [redacted]")
    .replace(SECRET_ASSIGNMENT, "$1=[redacted]")
    .replace(DATABASE_USER, "[database-user-redacted]")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function recordValue(value: unknown, depth: number): unknown {
  if (depth > 3) return "[depth-limited]";
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => recordValue(item, depth + 1));
  if (typeof value !== "object") return String(value).slice(0, 200);

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 30)) {
    result[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : recordValue(item, depth + 1);
  }
  return result;
}

export function sanitizeSystemLogDetails(value: unknown) {
  return recordValue(value, 0);
}

function errorField(error: unknown, field: string) {
  if (typeof error !== "object" || error === null || !(field in error)) return undefined;
  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

export function classifyOperationalError(error: unknown) {
  const code = errorField(error, "code") ?? errorField(error, "errno") ?? "UNKNOWN";
  const message = error instanceof Error ? error.message : errorField(error, "message") ?? "";
  const text = `${code} ${message}`;
  if (/P1001|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|can't connect|connection refused/iu.test(text)) return "DB_CONNECTION_FAILED";
  if (/P1002|ETIMEDOUT|timeout|timed out/iu.test(text)) return "DB_TIMEOUT";
  if (/too many connections|connection limit|pool.*exhaust/iu.test(text)) return "DB_CONNECTION_LIMIT";
  if (/access denied|command denied|permission|not authorized|privilege/iu.test(text)) return "DB_PERMISSION_DENIED";
  if (/P2021|P2022|doesn't exist|unknown column|missing (?:table|column)/iu.test(text)) return "DB_SCHEMA_MISMATCH";
  if (/P2034|deadlock|write conflict/iu.test(text)) return "DB_CONFLICT";
  return code.slice(0, 80);
}

export function safeErrorDiagnostic(error: unknown) {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : errorField(error, "message");
  const code = errorField(error, "code");
  const errno = errorField(error, "errno");
  const meta = typeof error === "object" && error !== null && "meta" in error
    ? sanitizeSystemLogDetails((error as { meta?: unknown }).meta)
    : undefined;

  return sanitizeSystemLogDetails({
    classification: classifyOperationalError(error),
    name,
    ...(code ? { code } : {}),
    ...(errno ? { errno } : {}),
    ...(message ? { message: sanitizeString(message) } : {}),
    ...(meta ? { meta } : {}),
  });
}
