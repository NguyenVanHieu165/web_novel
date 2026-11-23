export interface ContinueReadingEntry {
  storySlug: string;
  chapterId: number;
  chapterNumber: number;
  chapterSlug: string;
  chapterTitle: string;
  position: number;
  percent: number;
  updatedAt: number;
}

export interface ContinueReadingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const CONTINUE_READING_STORAGE_KEY = "web_novel_continue_reading_v1";
const maxEntries = 50;

function validEntry(value: unknown): value is ContinueReadingEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<ContinueReadingEntry>;
  return typeof entry.storySlug === "string" && entry.storySlug.length > 0 && entry.storySlug.length <= 300 &&
    typeof entry.chapterId === "number" && Number.isSafeInteger(entry.chapterId) && entry.chapterId > 0 &&
    typeof entry.chapterNumber === "number" && Number.isFinite(entry.chapterNumber) && entry.chapterNumber >= 0 &&
    typeof entry.chapterSlug === "string" && entry.chapterSlug.length > 0 && entry.chapterSlug.length <= 300 &&
    typeof entry.chapterTitle === "string" && entry.chapterTitle.length > 0 && entry.chapterTitle.length <= 1_000 &&
    typeof entry.position === "number" && Number.isInteger(entry.position) && entry.position >= 0 && entry.position <= 4_294_967_295 &&
    typeof entry.percent === "number" && Number.isFinite(entry.percent) && entry.percent >= 0 && entry.percent <= 100 &&
    typeof entry.updatedAt === "number" && Number.isFinite(entry.updatedAt) && entry.updatedAt > 0;
}

function parseEntries(raw: string | null): ContinueReadingEntry[] {
  try {
    if (!raw || raw.length > 250_000) return [];
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" || parsed === null ||
      !("version" in parsed) || parsed.version !== 1 ||
      !("entries" in parsed) || !Array.isArray(parsed.entries)
    ) return [];
    return parsed.entries
      .filter(validEntry)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, maxEntries);
  } catch {
    return [];
  }
}

function readEntries(storage: ContinueReadingStorage): ContinueReadingEntry[] {
  try {
    return parseEntries(storage.getItem(CONTINUE_READING_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function parseContinueReadingSnapshot(raw: string | null, storySlug: string) {
  return parseEntries(raw).find((entry) => entry.storySlug === storySlug) ?? null;
}

export function readContinueReading(storage: ContinueReadingStorage, storySlug: string) {
  return readEntries(storage).find((entry) => entry.storySlug === storySlug) ?? null;
}

export function writeContinueReading(storage: ContinueReadingStorage, value: ContinueReadingEntry) {
  if (!validEntry(value)) return;
  const entries = [value, ...readEntries(storage).filter((entry) => entry.storySlug !== value.storySlug)]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, maxEntries);
  try {
    storage.setItem(CONTINUE_READING_STORAGE_KEY, JSON.stringify({ version: 1, entries }));
  } catch {
    // Reading remains available when storage is blocked or full.
  }
}

export function selectLatestContinueReading(
  local: ContinueReadingEntry | null,
  server: ContinueReadingEntry | null,
) {
  if (!local) return server;
  if (!server) return local;
  return server.updatedAt > local.updatedAt ? server : local;
}
