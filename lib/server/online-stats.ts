import "server-only";

import { z } from "zod";
import type { OnlineStats } from "@/lib/admin-statistics";

const ONLINE_STATS_CACHE_MS = 10_000;
const ONLINE_STATS_TIMEOUT_MS = 1_500;
const onlineStatsSchema = z.object({
  totalConnections: z.number().int().nonnegative(),
  authenticatedUsers: z.number().int().nonnegative(),
  guestConnections: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
}).refine(
  (stats) => stats.authenticatedUsers <= stats.totalConnections
    && stats.guestConnections <= stats.totalConnections,
  { message: "Invalid online statistics totals" },
);

type OnlineStatsEnvironment = Record<string, string | undefined>;

type OnlineStatsLoaderOptions = {
  fetchImpl?: typeof fetch;
  environment?: OnlineStatsEnvironment;
  now?: () => number;
};

export function createOnlineStatsLoader({
  fetchImpl = fetch,
  environment = process.env,
  now = Date.now,
}: OnlineStatsLoaderOptions = {}) {
  let cache: { value: OnlineStats | null; expiresAt: number } | null = null;
  let inFlight: Promise<OnlineStats | null> | null = null;

  return async function loadOnlineStats(): Promise<OnlineStats | null> {
    const currentTime = now();
    if (cache && currentTime < cache.expiresAt) return cache.value;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      const baseUrl = environment.SOCKET_SERVER_URL?.trim();
      const token = environment.INTERNAL_SECRET_TOKEN?.trim();
      if (!baseUrl || !token) return null;

      try {
        const url = new URL("/internal/online-stats", baseUrl);
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        const response = await fetchImpl(url, {
          cache: "no-store",
          headers: { "x-internal-token": token },
          signal: AbortSignal.timeout(ONLINE_STATS_TIMEOUT_MS),
        });
        if (!response.ok) return null;
        const parsed = onlineStatsSchema.safeParse(await response.json());
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    })();

    try {
      const value = await inFlight;
      cache = { value, expiresAt: now() + ONLINE_STATS_CACHE_MS };
      return value;
    } finally {
      inFlight = null;
    }
  };
}

export const getOnlineStats = createOnlineStatsLoader();
