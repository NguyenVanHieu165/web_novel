export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

export function safeJobError(error: unknown) {
  const message = error instanceof Error ? error.message : "Background job failed";
  return message.replace(/\b(?:mysql|mysql2|mariadb|https?):\/\/\S+/giu, "[redacted-url]").slice(0, 4_000);
}
