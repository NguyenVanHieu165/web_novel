"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronLeft, ChevronRight, History, RefreshCw } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { readingHistoryResponseSchema, type ReadingHistoryResponse } from "@/lib/reading-progress";

const buttonStyles = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40";
const dateFormat = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

function HistoryResults({ page, onPageChange }: { page: number; onPageChange: (page: number) => void }) {
  const [data, setData] = useState<ReadingHistoryResponse | null>(null);
  const [error, setError] = useState(false);
  const [expired, setExpired] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/reading-history?page=${page}&limit=20`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          setExpired(true);
          return;
        }
        if (!response.ok) throw new Error("History request failed");
        const payload = readingHistoryResponseSchema.parse(await response.json());
        if (!controller.signal.aborted) setData(payload);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [page, retry]);

  if (expired) return <LoginPrompt />;
  if (error) return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-950/20">
      <p className="mb-4 text-sm text-red-700 dark:text-red-300" role="alert">Không thể tải lịch sử đọc. Vui lòng thử lại.</p>
      <button type="button" onClick={() => { setError(false); setRetry((value) => value + 1); }} className={`${buttonStyles} bg-white text-slate-800 hover:bg-slate-100 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700`}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" /> Thử lại
      </button>
    </div>
  );
  if (!data) return <p className="py-16 text-center text-sm text-slate-500" role="status">Đang tải lịch sử đọc…</p>;
  if (data.data.length === 0) return (
    <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-zinc-700">
      <BookOpen className="mx-auto mb-4 h-9 w-9 text-blue-500" aria-hidden="true" />
      <p className="font-semibold">{page === 1 ? "Bạn chưa có lịch sử đọc" : "Trang này chưa có chương đã đọc"}</p>
      <p className="mt-2 text-sm text-slate-500 dark:text-zinc-400">Tiến độ sẽ được lưu khi bạn đọc chương trong tài khoản của mình.</p>
      {page > 1 ? (
        <button type="button" onClick={() => onPageChange(1)} className={`${buttonStyles} mt-5 bg-blue-600 text-white hover:bg-blue-700`}>Về trang đầu</button>
      ) : (
        <Link href="/truyen-moi" className={`${buttonStyles} mt-5 bg-blue-600 text-white hover:bg-blue-700`}>Khám phá truyện</Link>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500 dark:text-zinc-400" aria-live="polite">{data.meta.total} chương đã đọc</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {data.data.map((item) => (
          <article key={item.chapterId} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <Link href={`/truyen/${item.storySlug}`} className="line-clamp-2 text-base font-bold hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-blue-400">{item.storyTitle}</Link>
            <p className="mt-2 truncate text-sm text-slate-500 dark:text-zinc-400">{item.chapterTitle}</p>
            <div className="my-4 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-zinc-400">
                <span>Đã đọc {Math.round(item.percent)}%</span>
                {item.updatedAt && <time dateTime={item.updatedAt}>{dateFormat.format(new Date(item.updatedAt))}</time>}
              </div>
              <progress value={item.percent} max={100} aria-label={`Tiến độ ${item.chapterTitle}`} className="h-1.5 w-full overflow-hidden rounded-full accent-blue-600" />
            </div>
            <Link href={`/truyen/${item.storySlug}/${item.chapterSlug}`} className={`${buttonStyles} w-full bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50`}>Tiếp tục đọc</Link>
          </article>
        ))}
      </div>
      {data.meta.totalPage > 1 && (
        <nav aria-label="Phân trang lịch sử đọc" className="flex items-center justify-center gap-3">
          <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className={`${buttonStyles} border border-slate-200 hover:bg-slate-100 dark:border-zinc-700 dark:hover:bg-zinc-800`}><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Trước</button>
          <span className="text-sm tabular-nums" aria-live="polite">{page} / {data.meta.totalPage}</span>
          <button type="button" disabled={page >= data.meta.totalPage} onClick={() => onPageChange(page + 1)} className={`${buttonStyles} border border-slate-200 hover:bg-slate-100 dark:border-zinc-700 dark:hover:bg-zinc-800`}>Sau <ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
        </nav>
      )}
    </div>
  );
}

function LoginPrompt() {
  return (
    <div className="rounded-2xl border border-slate-200 p-10 text-center dark:border-zinc-800">
      <p className="mb-5 text-sm text-slate-500 dark:text-zinc-400">Đăng nhập để lưu và xem lịch sử đọc trên tài khoản của bạn.</p>
      <Link href="/dang-nhap?redirect=%2Flich-su" className={`${buttonStyles} bg-blue-600 text-white hover:bg-blue-700`}>Đăng nhập</Link>
    </div>
  );
}

export default function ReadingHistory() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState(1);
  return (
    <div className="mx-auto max-w-4xl space-y-7 py-4">
      <div className="flex items-center gap-3">
        <History className="h-7 w-7 text-blue-600" aria-hidden="true" />
        <div><h1 className="text-2xl font-black">Lịch sử đọc</h1><p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">Tiếp tục câu chuyện từ vị trí bạn đã lưu.</p></div>
      </div>
      {loading ? <p className="py-16 text-center text-sm text-slate-500" role="status">Đang tải tài khoản…</p> : user ? <HistoryResults key={`${user.idTaiKhoan}:${page}`} page={page} onPageChange={setPage} /> : <LoginPrompt />}
    </div>
  );
}
