import "server-only";

type Entry = { count: number; expiresAt: number };
const entries = new Map<string, Entry>();
let lastCleanup = 0;

export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  if (now - lastCleanup >= 60_000) {
    for (const [name, entry] of entries) if (entry.expiresAt <= now) entries.delete(name);
    lastCleanup = now;
  }
  const current = entries.get(key);
  if (!current || current.expiresAt <= now) {
    entries.set(key, { count: 1, expiresAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  if (current.count >= limit) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.expiresAt - now) / 1000)) };
  }
  current.count++;
  return { allowed: true, retryAfter: 0 };
}

export function requestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() || "unknown";
}
