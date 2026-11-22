export interface ProgressPoint { position: number; percent: number }
export interface StoredReadingProgress extends ProgressPoint {
  scope: string;
  chapterId: number;
  updatedAt: number;
  pending: boolean;
}

export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const storageKey = "web_novel_reading_progress_v1";
const maxEntries = 100;

export function progressScope(accountId?: number) {
  return accountId === undefined ? "guest" : `account:${accountId}`;
}

export function normalizePoint(value: ProgressPoint): ProgressPoint {
  return {
    position: Math.round(Math.max(0, Math.min(4_294_967_295, Number.isFinite(value.position) ? value.position : 0))),
    percent: Math.round(Math.max(0, Math.min(100, Number.isFinite(value.percent) ? value.percent : 0)) * 100) / 100,
  };
}

export function classifyReaderScroll(lastIntent: number, eventTime: number, ignoreUntil = 0) {
  const userDriven = eventTime >= ignoreUntil && eventTime >= lastIntent && eventTime - lastIntent < 1500;
  return { userDriven, lastIntent: userDriven ? eventTime : lastIntent };
}

export function measureReadingProgress({ scrollY, contentTop, contentHeight, viewportHeight, stickyOffset = 56 }: {
  scrollY: number; contentTop: number; contentHeight: number; viewportHeight: number; stickyOffset?: number;
}): ProgressPoint {
  const visibleHeight = Math.max(1, viewportHeight - stickyOffset);
  const distance = Math.max(0, contentHeight - visibleHeight);
  if (distance === 0) {
    return { position: 0, percent: scrollY + viewportHeight >= contentTop + contentHeight ? 100 : 0 };
  }
  const position = Math.max(0, Math.min(scrollY + stickyOffset - contentTop, distance));
  return normalizePoint({ position, percent: position / distance * 100 });
}

export function resumeScrollPosition({ percent, contentTop, contentHeight, viewportHeight, stickyOffset = 56 }: {
  percent: number; contentTop: number; contentHeight: number; viewportHeight: number; stickyOffset?: number;
}) {
  const distance = Math.max(0, contentHeight - Math.max(1, viewportHeight - stickyOffset));
  return Math.max(0, contentTop - stickyOffset + distance * Math.max(0, Math.min(100, percent)) / 100);
}

function validRecord(value: unknown): value is StoredReadingProgress {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Partial<StoredReadingProgress>;
  return typeof row.scope === "string" && /^(guest|account:[1-9]\d*)$/.test(row.scope) &&
    typeof row.chapterId === "number" && Number.isSafeInteger(row.chapterId) && row.chapterId > 0 &&
    typeof row.position === "number" && Number.isInteger(row.position) && row.position >= 0 && row.position <= 4_294_967_295 &&
    typeof row.percent === "number" && Number.isFinite(row.percent) && row.percent >= 0 && row.percent <= 100 &&
    typeof row.updatedAt === "number" && Number.isFinite(row.updatedAt) && row.updatedAt > 0 && typeof row.pending === "boolean";
}

function readRecords(storage: ProgressStorage): StoredReadingProgress[] {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw || raw.length > 100_000) return [];
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || !("version" in parsed) || parsed.version !== 1 || !("entries" in parsed) || !Array.isArray(parsed.entries)) return [];
    return parsed.entries.filter(validRecord).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, maxEntries);
  } catch { return []; }
}

export function readLocalProgress(storage: ProgressStorage, scope: string, chapterId: number) {
  return readRecords(storage).find((row) => row.scope === scope && row.chapterId === chapterId) ?? null;
}

export function writeLocalProgress(storage: ProgressStorage, value: StoredReadingProgress) {
  if (!validRecord(value)) return;
  const records = readRecords(storage).filter((row) => row.scope !== value.scope || row.chapterId !== value.chapterId);
  const entries = [value, ...records].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, maxEntries);
  try { storage.setItem(storageKey, JSON.stringify({ version: 1, entries })); } catch { /* Memory/server progress still works when local storage is unavailable. */ }
}

export function selectResumeProgress(server: (ProgressPoint & { updatedAt: string | null }) | null, local: StoredReadingProgress | null) {
  if (!server) return local;
  const serverTime = server.updatedAt === null ? 0 : Date.parse(server.updatedAt);
  if (local?.pending && local.updatedAt > (Number.isFinite(serverTime) ? serverTime : 0)) return local;
  return server.updatedAt === null ? null : { ...server, pending: false };
}

interface PendingPoint extends ProgressPoint { revision: number }

// One in-flight save coalesces newer points. Closing forbids follow-up requests
// after an account change; any latest pending point remains in local storage.
export function createProgressSaveQueue({ save, persist, onSaved, onError }: {
  save: (point: ProgressPoint, keepalive: boolean) => Promise<void>;
  persist: (point: ProgressPoint, pending: boolean) => void;
  onSaved?: () => void;
  onError?: (error: unknown) => void;
}) {
  let pending: PendingPoint | null = null;
  let flight: Promise<void> | null = null;
  let revision = 0;
  let closed = false;
  let useKeepalive = false;

  function enqueue(point: ProgressPoint) {
    if (closed) return;
    pending = { ...normalizePoint(point), revision: ++revision };
    persist({ position: pending.position, percent: pending.percent }, true);
  }
  async function drain() {
    while (!closed && pending) {
      const point = pending;
      try {
        await save({ position: point.position, percent: point.percent }, useKeepalive);
        if (!closed && pending?.revision === point.revision) {
          pending = null;
          persist({ position: point.position, percent: point.percent }, false);
        }
        if (!closed) onSaved?.();
      } catch (error) {
        if (!closed) onError?.(error);
        break;
      }
    }
  }
  function flush(keepalive = false): Promise<void> {
    useKeepalive ||= keepalive;
    if (closed || !pending) return Promise.resolve();
    if (flight) return flight;
    flight = drain().finally(() => { flight = null; });
    return flight;
  }
  return { enqueue, flush, hasPending: () => pending !== null, close: () => { closed = true; } };
}
