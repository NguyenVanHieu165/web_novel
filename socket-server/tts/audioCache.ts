export const MAX_AUDIO_CACHE_BYTES = 80 * 1024 * 1024;
export const AUDIO_CACHE_TTL_MS = 20 * 60 * 1000;
export const TTS_VOICES = {
  "vi-VN-HoaiMyNeural": "Nữ · Hoài My",
  "vi-VN-NamMinhNeural": "Nam · Nam Minh",
} as const;
export type TtsVoice = keyof typeof TTS_VOICES;

interface CacheEntry { buffer: Buffer; expiresAt: number }
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<Buffer>>();
let cachedBytes = 0;

function remove(key: string) {
  const entry = cache.get(key);
  if (!entry) return;
  cachedBytes -= entry.buffer.length;
  cache.delete(key);
}
function pruneExpired(now: number) {
  for (const [key, entry] of cache) if (entry.expiresAt <= now) remove(key);
}

export function getCachedAudio(key: string, now = Date.now()): Buffer | undefined {
  pruneExpired(now);
  const entry = cache.get(key);
  if (!entry) return undefined;
  cache.delete(key);
  cache.set(key, entry);
  return entry.buffer;
}
export function setCachedAudio(key: string, buffer: Buffer, now = Date.now()): void {
  if (!buffer.length || buffer.length > MAX_AUDIO_CACHE_BYTES) return;
  pruneExpired(now);
  remove(key);
  while (cachedBytes + buffer.length > MAX_AUDIO_CACHE_BYTES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    remove(oldest);
  }
  cache.set(key, { buffer, expiresAt: now + AUDIO_CACHE_TTL_MS });
  cachedBytes += buffer.length;
}

/** At most one synthesizer call per key; failed work is never cached. */
export function getOrCreateAudio(key: string, synthesize: () => Promise<Buffer>): Promise<Buffer> {
  const cached = getCachedAudio(key);
  if (cached) return Promise.resolve(cached);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = Promise.resolve().then(synthesize).then((buffer) => {
    setCachedAudio(key, buffer);
    return buffer;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

export function audioCacheStats() { return { entries: cache.size, bytes: cachedBytes, inFlight: inFlight.size }; }
export function clearAudioCacheForTests() { cache.clear(); inFlight.clear(); cachedBytes = 0; }
