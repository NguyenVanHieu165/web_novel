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
import { Button } from "@/components/ui/button";

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
        <Button asChild size="lg" className="rounded-xl font-bold"><Link href={getChapterPath(storySlug, progress.chapterSlug)}>
          <BookOpen className="size-4" aria-hidden="true" />
          Đọc tiếp · Chương {progress.chapterNumber}
        </Link></Button>
        <Button asChild size="lg" variant="outline" className="rounded-xl"><Link href={firstChapterHref}>
          <RotateCcw className="size-4 text-blue-500" aria-hidden="true" />
          Đọc từ đầu
        </Link></Button>
      </>
    );
  }

  return (
    <Button asChild size="lg" className="rounded-xl font-bold"><Link href={firstChapterHref}>
      <BookOpen className="size-4" aria-hidden="true" />
      Đọc từ đầu
    </Link></Button>
  );
}
