"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookMarked, BookOpen, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { z } from "zod";

import { useAuth } from "@/context/AuthContext";

const responseSchema = z.object({
  success: z.literal(true),
  data: z.array(z.object({
    id: z.number().int(),
    followedAt: z.string().nullable(),
    story: z.object({
      idTruyen: z.number().int(),
      tenTruyen: z.string(),
      slug: z.string(),
      cover: z.string(),
      completed: z.boolean(),
      chapters: z.number().int().nonnegative(),
    }),
  })),
  meta: z.object({ page: z.number().int(), total: z.number().int(), totalPage: z.number().int() }),
});
type BookshelfResponse = z.infer<typeof responseSchema>;
type RequestState =
  | { key: string; kind: "ready"; result: BookshelfResponse }
  | { key: string; kind: "error"; requiresLogin: boolean };

const buttonStyles = "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-zinc-800";
const dateFormat = new Intl.DateTimeFormat("vi-VN");

export default function Bookshelf() {
  const { user, loading: authLoading } = useAuth();
  const accountId = user?.idTaiKhoan ?? null;
  const [pagination, setPagination] = useState({ accountId, page: 1 });
  const [retry, setRetry] = useState(0);
  const [requestState, setRequestState] = useState<RequestState | null>(null);
  const page = pagination.accountId === accountId ? pagination.page : 1;
  const key = `${accountId}:${page}:${retry}`;
  const currentState = requestState?.key === key ? requestState : null;
  const result = currentState?.kind === "ready" ? currentState.result : null;
  const requiresLogin = !user || (currentState?.kind === "error" && currentState.requiresLogin);
  const loading = authLoading || Boolean(user && !currentState);

  useEffect(() => {
    if (authLoading || accountId === null) return;
    const controller = new AbortController();
    fetch(`/api/bookshelf?page=${page}&limit=12`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          if (!controller.signal.aborted) setRequestState({ key, kind: "error", requiresLogin: response.status === 401 });
          return;
        }
        const data = responseSchema.parse(await response.json());
        if (!controller.signal.aborted) setRequestState({ key, kind: "ready", result: data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setRequestState({ key, kind: "error", requiresLogin: false });
      });
    return () => controller.abort();
  }, [authLoading, accountId, page, key]);

  return (
    <div className="space-y-7 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400">
            <BookMarked className="h-5 w-5" aria-hidden="true" />
            Truyện bạn đang theo dõi
          </div>
          <h1 className="text-2xl font-black text-slate-900 sm:text-3xl dark:text-white">Tủ sách của bạn</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-zinc-400">Theo dõi một tác phẩm để lưu vào tủ sách và tìm lại khi muốn đọc.</p>
        </div>
        {user && !requiresLogin && (
          <button type="button" onClick={() => setRetry((value) => value + 1)} disabled={loading} className={buttonStyles}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Làm mới
          </button>
        )}
      </div>

      {loading ? (
        <div role="status" aria-label="Đang tải tủ sách" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-48 rounded-2xl bg-slate-200/70 motion-safe:animate-pulse dark:bg-zinc-800" />
          ))}
        </div>
      ) : requiresLogin ? (
        <section className="rounded-2xl border bg-white px-6 py-14 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <BookMarked className="mx-auto mb-4 h-10 w-10 text-blue-500" aria-hidden="true" />
          <h2 className="text-lg font-bold">Đăng nhập để xem tủ sách</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-zinc-400">Tủ sách được lưu riêng trong tài khoản để bạn có thể đọc trên nhiều thiết bị.</p>
          <Link href="/dang-nhap?redirect=%2Ftu-sach" className="mt-5 inline-flex rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">Đăng nhập</Link>
        </section>
      ) : currentState?.kind === "error" ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-950/30">
          <p className="text-sm text-red-700 dark:text-red-300" role="alert">Không thể tải tủ sách. Vui lòng thử lại.</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)} className={`mt-4 ${buttonStyles}`}>Thử lại</button>
        </section>
      ) : result && result.data.length > 0 ? (
        <>
          <p className="text-sm tabular-nums text-slate-500 dark:text-zinc-400" aria-live="polite">{result.meta.total.toLocaleString("vi-VN")} truyện trong tủ sách</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.data.map(({ id, followedAt, story }) => (
              <Link
                key={id}
                href={`/truyen/${story.slug}`}
                className="group flex gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-blue-600"
              >
                <div className="h-36 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-zinc-800">
                  {story.cover ? (
                    // Covers use existing external URLs, which are not restricted to Next image hosts.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={story.cover} alt={story.tenTruyen} width={96} height={144} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  ) : <BookOpen className="m-auto h-full w-8 text-slate-400" aria-hidden="true" />}
                </div>
                <div className="min-w-0 space-y-2">
                  <h2 className="line-clamp-2 text-base font-bold text-slate-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">{story.tenTruyen}</h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">{story.completed ? "Đã hoàn thành" : "Đang cập nhật"}</p>
                  <p className="text-sm tabular-nums text-slate-600 dark:text-zinc-300">{story.chapters.toLocaleString("vi-VN")} chương</p>
                  {followedAt && <p className="text-xs text-slate-400 dark:text-zinc-500">Theo dõi từ {dateFormat.format(new Date(followedAt))}</p>}
                  <span className="inline-flex pt-1 text-xs font-bold text-blue-600 dark:text-blue-400">Xem truyện →</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <section className="rounded-2xl border bg-white px-6 py-14 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <BookOpen className="mx-auto mb-4 h-10 w-10 text-slate-400" aria-hidden="true" />
          <h2 className="text-lg font-bold">Tủ sách chưa có truyện</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-zinc-400">Nhấn “Theo dõi” ở trang truyện bạn yêu thích để lưu tại đây.</p>
          <Link href="/truyen-moi" className={`mt-5 ${buttonStyles}`}>Khám phá truyện mới</Link>
        </section>
      )}

      {result && result.meta.totalPage > 1 && (
        <nav aria-label="Phân trang tủ sách" className="flex items-center justify-center gap-3">
          <button type="button" aria-label="Trang trước" disabled={loading || page <= 1} onClick={() => setPagination({ accountId, page: page - 1 })} className={buttonStyles}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
          <span className="text-sm tabular-nums" aria-live="polite">Trang {page} / {result.meta.totalPage}</span>
          <button type="button" aria-label="Trang sau" disabled={loading || page >= result.meta.totalPage} onClick={() => setPagination({ accountId, page: page + 1 })} className={buttonStyles}><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
        </nav>
      )}
    </div>
  );
}
