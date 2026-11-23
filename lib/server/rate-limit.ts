import "server-only";

import { prisma } from "@/lib/prisma";
import { checkRateLimitWithDatabase, hashRateLimitKey, type RateLimitResult } from "@/lib/server/rate-limit-core";

export { hashRateLimitKey };
export type { RateLimitResult };

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<RateLimitResult> {
  return checkRateLimitWithDatabase(prisma, key, limit, windowMs, now);
}

export function requestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() || "unknown";
}
