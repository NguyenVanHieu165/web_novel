export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = Reflect.get(error, "message");
    if (typeof message === "string") return message;
  }
  return "Background job failed";
}

export function safeJobError(error: unknown) {
  return errorMessage(error)
    .replace(/(\b(?:password|passwd|pwd)\b\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}\]]+)/giu, "$1[redacted]")
    .replace(/\b(?:mysql|mysql2|mariadb|https?):\/\/\S+/giu, "[redacted-url]")
    .slice(0, 4_000);
}

export function safeJobErrorDetails(error: unknown): { error: string; cause?: string } {
  const details: { error: string; cause?: string } = { error: safeJobError(error) };
  if (typeof error !== "object" || error === null || !("cause" in error)) return details;

  const cause = Reflect.get(error, "cause");
  if (cause !== undefined && cause !== null) details.cause = safeJobError(cause);
  return details;
}
