"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, ArrowRight, RefreshCw } from "lucide-react";
import SectionHeader from "@/components/common/SectionHeader";
import { useAuth } from "@/context/AuthContext";
import { readingHistoryResponseSchema, type ReadingHistoryResponse } from "@/lib/reading-progress";

type HistoryItem = ReadingHistoryResponse["data"][number];

function UserContinueReading() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/reading-history?limit=20", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Reading history request failed");
        const payload = readingHistoryResponseSchema.parse(await response.json());
        if (controller.signal.aborted) return;
        // The API is newest-first; resume the most recent chapter of each story.
        const seenStories = new Set<string>();
        const recent = payload.data.filter((item) => {
          if (seenStories.has(item.storySlug)) return false;
          seenStories.add(item.storySlug);
          return true;
        });
        setItems(recent.slice(0, 4));
        setLoading(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [retry]);

  if (!loading && !failed && items.length === 0) return null;

  return (
    <section>
      <SectionHeader title="Tiếp tục đọc" href="/lich-su" />
      {loading ? (
        <div role="status" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <span className="sr-only">Đang tải các chương đang đọc…</span>
          {[1, 2, 3, 4].map((key) => <div key={key} aria-hidden="true" className="h-[114px] rounded-xl bg-slate-100 motion-safe:animate-pulse dark:bg-zinc-900" />)}
        </div>
      ) : failed ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p role="alert" className="text-sm text-slate-500 dark:text-zinc-400">Không thể tải các chương đang đọc.</p>
          <button type="button" onClick={() => { setFailed(false); setLoading(true); setRetry((value) => value + 1); }} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400 dark:hover:bg-blue-950/40">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Thử lại
          </button>
        </div>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map((item) => (
          <div
            key={item.chapterId}
            className="flex gap-3 p-3 bg-white dark:bg-zinc-900 rounded-xl border border-slate-100 dark:border-zinc-800/80 shadow-xs hover:shadow-md hover:border-blue-100 dark:hover:border-zinc-700 transition-[box-shadow,border-color] duration-200 motion-reduce:transition-none group"
          >
            {/* Cover */}
            <Link href={`/truyen/${item.storySlug}/${item.chapterSlug}`} className="shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              <div className="w-16 h-22 rounded-lg overflow-hidden bg-slate-100 dark:bg-zinc-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.storyCover || "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=200&auto=format&fit=crop&q=60"}
                  alt={item.storyTitle}
                  width={64}
                  height={88}
                  className="w-full h-full object-cover motion-safe:group-hover:scale-105 transition-transform duration-250 motion-reduce:transition-none"
                  loading="lazy"
                />
              </div>
            </Link>

            {/* Info */}
            <div className="flex flex-col justify-between py-0.5 min-w-0 flex-1">
              <div>
                <Link href={`/truyen/${item.storySlug}`} className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  <h3 className="font-bold text-sm text-slate-800 dark:text-zinc-100 line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {item.storyTitle}
                  </h3>
                </Link>
                <p className="flex items-center gap-1 text-xs text-slate-400 mt-1">
                  <BookOpen className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.chapterTitle}</span>
                </p>
              </div>

              {/* Progress bar */}
              <div className="space-y-1 mt-2">
                <div role="progressbar" aria-label={`Tiến độ ${item.chapterTitle}`} aria-valuenow={Math.round(item.percent)} aria-valuemin={0} aria-valuemax={100} className="h-1.5 w-full bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full origin-left bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-transform duration-300 motion-reduce:transition-none"
                    style={{ transform: `scaleX(${item.percent / 100})` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] tabular-nums text-slate-400">{Math.round(item.percent)}%</span>
                  <Link
                    href={`/truyen/${item.storySlug}/${item.chapterSlug}`}
                    className="flex items-center gap-0.5 rounded text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    Đọc tiếp <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}
    </section>
  );
}

export default function ContinueReading() {
  const { user, loading } = useAuth();
  if (loading || !user) return null;
  // Auth changes remount the fetch state, so one account never sees another's history.
  return <UserContinueReading key={user.idTaiKhoan} />;
}
