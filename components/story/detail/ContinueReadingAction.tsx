"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { BookOpen, RotateCcw } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import {
  CONTINUE_READING_STORAGE_KEY,
  parseContinueReadingSnapshot,
  selectLatestContinueReading,
  writeContinueReading,
  type ContinueReadingEntry,
} from "@/lib/continue-reading-state";
import { getChapterPath } from "@/lib/reader-navigation";
import { progressResponseSchema, readingHistoryResponseSchema } from "@/lib/reading-progress";

interface ContinueReadingActionProps {
  storySlug: string;
  firstChapterHref: string;
}

interface SyncedProgressState {
  storySlug: string;
  accountId: number;
  progress: ContinueReadingEntry;
}

function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function readStorageSnapshot() {
  try {
    return window.localStorage.getItem(CONTINUE_READING_STORAGE_KEY);
  } catch {
    return null;
  }
}

function readServerSnapshot() {
  return null;
}

const primaryClassName = "flex touch-manipulation items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/25 transition-[transform,background-color] duration-200 hover:from-blue-700 hover:to-indigo-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 motion-reduce:transform-none";
const secondaryClassName = "flex touch-manipulation items-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-800 transition-[transform,background-color] duration-200 hover:bg-slate-50 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 motion-reduce:transform-none";

export default function ContinueReadingAction({ storySlug, firstChapterHref }: ContinueReadingActionProps) {
  const { user, loading } = useAuth();
  const accountId = user?.idTaiKhoan;
  const localSnapshot = useSyncExternalStore(subscribeToStorage, readStorageSnapshot, readServerSnapshot);
  const local = useMemo(
    () => parseContinueReadingSnapshot(localSnapshot, storySlug),
    [localSnapshot, storySlug],
  );
  const [synced, setSynced] = useState<SyncedProgressState | null>(null);
  const progress = synced?.storySlug === storySlug && synced.accountId === accountId
    ? synced.progress
    : local;

  useEffect(() => {
    const storage = window.localStorage;
    if (loading || accountId === undefined) return;
    const authenticatedAccountId = accountId;
    const controller = new AbortController();

    async function syncProgress() {
      try {
        const response = await fetch(`/api/reading-history?storySlug=${encodeURIComponent(storySlug)}&limit=1`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const history = readingHistoryResponseSchema.parse(await response.json());
        const row = history.data[0];
        const updatedAt = row?.updatedAt ? Date.parse(row.updatedAt) : 0;
        const server = row && Number.isFinite(updatedAt) && updatedAt > 0 ? {
          storySlug: row.storySlug,
          chapterId: row.chapterId,
          chapterNumber: row.chapterNumber,
          chapterSlug: row.chapterSlug,
          chapterTitle: row.chapterTitle,
          position: row.position,
          percent: row.percent,
          updatedAt,
        } satisfies ContinueReadingEntry : null;
        const latest = selectLatestContinueReading(local, server);
        if (!latest || controller.signal.aborted) return;

        setSynced({ storySlug, accountId: authenticatedAccountId, progress: latest });
        writeContinueReading(storage, latest);

        if (local && latest === local && (!server || local.updatedAt > server.updatedAt)) {
          const saveResponse = await fetch(`/api/chapters/${local.chapterId}/progress`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", "X-Reader-Account": String(authenticatedAccountId) },
            body: JSON.stringify({ position: local.position, percent: local.percent }),
            signal: controller.signal,
          });
          if (!saveResponse.ok) return;
          const saved = progressResponseSchema.parse(await saveResponse.json());
          const savedAt = saved.data.updatedAt ? Date.parse(saved.data.updatedAt) : local.updatedAt;
          const synced = { ...local, updatedAt: Number.isFinite(savedAt) ? savedAt : local.updatedAt };
          writeContinueReading(storage, synced);
          if (!controller.signal.aborted) setSynced({ storySlug, accountId: authenticatedAccountId, progress: synced });
        }
      } catch (error) {
        if (!controller.signal.aborted) console.error("Không thể đồng bộ trạng thái đọc tiếp", error);
      }
    }

    void syncProgress();
    return () => controller.abort();
  }, [storySlug, loading, accountId, local]);

  if (progress) {
    return (
      <>
        <Link href={getChapterPath(storySlug, progress.chapterSlug)} className={primaryClassName}>
          <BookOpen className="size-4" aria-hidden="true" />
          Đọc tiếp · Chương {progress.chapterNumber}
        </Link>
        <Link href={firstChapterHref} className={secondaryClassName}>
          <RotateCcw className="size-4 text-blue-500" aria-hidden="true" />
          Đọc từ đầu
        </Link>
      </>
    );
  }

  return (
    <Link href={firstChapterHref} className={primaryClassName}>
      <BookOpen className="size-4" aria-hidden="true" />
      Đọc từ đầu
    </Link>
  );
}
