import { createHash } from "node:crypto";
import type { PrismaClient } from "@/app/generated/prisma/client";

export type RateLimitDatabase = Pick<PrismaClient, "$executeRaw" | "$queryRaw">;
type RateLimitRow = { soLan: number | bigint; hetHan: Date | string };
export type RateLimitResult = { allowed: boolean; retryAfter: number; remaining: number };

export function hashRateLimitKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export async function checkRateLimitWithDatabase(
  db: RateLimitDatabase,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<RateLimitResult> {
  const keyHash = hashRateLimitKey(key);
  const current = new Date(now);
  const expiresAt = new Date(now + windowMs);
  await db.$executeRaw`
    INSERT INTO gioi_han_tan_suat (khoa_bam, so_lan, het_han, updated_at)
    VALUES (${keyHash}, 1, ${expiresAt}, ${current})
    ON DUPLICATE KEY UPDATE
      so_lan = IF(het_han <= ${current}, 1, so_lan + 1),
      het_han = IF(het_han <= ${current}, ${expiresAt}, het_han),
      updated_at = ${current}
  `;
  const rows = await db.$queryRaw<RateLimitRow[]>`
    SELECT so_lan AS soLan, het_han AS hetHan
    FROM gioi_han_tan_suat WHERE khoa_bam = ${keyHash} LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Rate limit bucket was not persisted.");
  const count = Number(row.soLan);
  const end = new Date(row.hetHan).getTime();
  return {
    allowed: count <= limit,
    retryAfter: count <= limit ? 0 : Math.max(1, Math.ceil((end - now) / 1000)),
    remaining: Math.max(0, limit - count),
  };
}
