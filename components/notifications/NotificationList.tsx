"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { z } from "zod";

import { useAuth } from "@/context/AuthContext";

const notificationSchema = z.object({
  success: z.literal(true),
  data: z.array(z.object({
    id: z.number().int().positive(), title: z.string(), content: z.string(),
    read: z.boolean(), createdAt: z.string().nullable(),
  })),
  meta: z.object({ page: z.number().int(), total: z.number().int(), totalPage: z.number().int(), unread: z.number().int() }),
});
const mutationSchema = z.object({ success: z.literal(true), unread: z.number().int().nonnegative() });
type NotificationResponse = z.infer<typeof notificationSchema>;
type RequestState =
  | { key: string; kind: "ready"; result: NotificationResponse }
  | { key: string; kind: "error"; requiresLogin: boolean };

const buttonStyles = "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-zinc-800";
const dateFormat = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });

export default function NotificationList() {
  const { user, loading: authLoading } = useAuth();
  const accountId = user?.idTaiKhoan ?? null;
  const [pagination, setPagination] = useState({ accountId, page: 1 });
  const [retry, setRetry] = useState(0);
  const [requestState, setRequestState] = useState<RequestState | null>(null);
  const [pending, setPending] = useState<number | "all" | null>(null);
  const [mutationError, setMutationError] = useState<{ key: string; message: string } | null>(null);
  const requestInFlight = useRef(false);
  const activeAccountId = useRef(accountId);
  useEffect(() => { activeAccountId.current = accountId; }, [accountId]);

  const page = pagination.accountId === accountId ? pagination.page : 1;
  const key = `${accountId}:${page}:${retry}`;
  const currentState = requestState?.key === key ? requestState : null;
  const result = currentState?.kind === "ready" ? currentState.result : null;
  const requiresLogin = !user || (currentState?.kind === "error" && currentState.requiresLogin);
  const loading = authLoading || Boolean(user && !currentState);

  useEffect(() => {
    if (authLoading || accountId === null) return;
    const controller = new AbortController();
    fetch(`/api/notifications?page=${page}&limit=12`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          if (!controller.signal.aborted) setRequestState({ key, kind: "error", requiresLogin: response.status === 401 });
          return;
        }
        const data = notificationSchema.parse(await response.json());
        if (!controller.signal.aborted) setRequestState({ key, kind: "ready", result: data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setRequestState({ key, kind: "error", requiresLogin: false });
      });
    return () => controller.abort();
  }, [authLoading, accountId, page, key]);

  useEffect(() => {
    const refresh = () => setRetry((value) => value + 1);
    window.addEventListener("notifications-updated", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("notifications-updated", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const markRead = async (id: number | "all") => {
    if (requestInFlight.current || !result || accountId === null) return;
    requestInFlight.current = true;
    setPending(id);
    setMutationError(null);
    try {
      const response = await fetch("/api/notifications", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id === "all" ? { all: true } : { id }),
      });
      if (!response.ok) {
        if (response.status === 401 && activeAccountId.current === accountId) {
          setRequestState({ key, kind: "error", requiresLogin: true });
        }
        throw new Error("Không thể đánh dấu đã đọc. Vui lòng thử lại.");
      }
      const data = mutationSchema.parse(await response.json());
      if (activeAccountId.current !== accountId) return;
      setRequestState((current) => current?.key === key && current.kind === "ready" ? {
        ...current,
        result: {
          ...current.result,
          data: current.result.data.map((item) => id === "all" || item.id === id ? { ...item, read: true } : item),
          meta: { ...current.result.meta, unread: data.unread },
        },
      } : current);
      window.dispatchEvent(new Event("notifications-updated"));
    } catch (error) {
      if (activeAccountId.current === accountId) setMutationError({ key, message: error instanceof Error ? error.message : "Không thể cập nhật thông báo." });
    } finally {
      requestInFlight.current = false;
      setPending(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400"><Bell className="h-5 w-5" aria-hidden="true" />Cập nhật dành cho bạn</div>
          <h1 className="text-2xl font-black sm:text-3xl">Thông báo</h1>
          {result && <p className="mt-2 text-sm tabular-nums text-slate-500 dark:text-zinc-400" aria-live="polite">{result.meta.unread.toLocaleString("vi-VN")} chưa đọc · {result.meta.total.toLocaleString("vi-VN")} thông báo</p>}
        </div>
        {user && !requiresLogin && <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setRetry((value) => value + 1)} disabled={loading || pending !== null} className={buttonStyles}><RefreshCw className="h-4 w-4" aria-hidden="true" />Làm mới</button>
          <button type="button" onClick={() => void markRead("all")} disabled={loading || pending !== null || !result?.meta.unread} className={buttonStyles}><CheckCheck className="h-4 w-4" aria-hidden="true" />{pending === "all" ? "Đang cập nhật…" : "Đọc tất cả"}</button>
        </div>}
      </div>

      {mutationError?.key === key && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{mutationError.message}</p>}
      {loading ? (
        <div className="space-y-3" role="status" aria-label="Đang tải thông báo">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-28 rounded-2xl bg-slate-200/70 motion-safe:animate-pulse dark:bg-zinc-800" />)}</div>
      ) : requiresLogin ? (
        <section className="rounded-2xl border bg-white px-6 py-14 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <Bell className="mx-auto mb-4 h-10 w-10 text-blue-500" aria-hidden="true" />
          <h2 className="text-lg font-bold">Đăng nhập để xem thông báo</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-zinc-400">Thông báo của bạn chỉ hiển thị trong tài khoản của bạn.</p>
          <Link href="/dang-nhap?redirect=%2Fthong-bao" className="mt-5 inline-flex rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500">Đăng nhập</Link>
        </section>
      ) : currentState?.kind === "error" ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-950/30">
          <p className="text-sm text-red-700 dark:text-red-300" role="alert">Không thể tải thông báo. Vui lòng thử lại.</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)} className={`mt-4 ${buttonStyles}`}>Thử lại</button>
        </section>
      ) : result && result.data.length > 0 ? (
        <ul className="space-y-3">{result.data.map((notification) => (
          <li key={notification.id} className={`rounded-2xl border p-5 ${notification.read ? "border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900" : "border-blue-200 bg-blue-50/70 dark:border-blue-900 dark:bg-blue-950/20"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="break-words text-base font-bold">{!notification.read && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-blue-500" aria-label="Chưa đọc" />}{notification.title}</h2>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 dark:text-zinc-300">{notification.content}</p>
                {notification.createdAt && <time dateTime={notification.createdAt} className="mt-3 block text-xs text-slate-400 dark:text-zinc-500">{dateFormat.format(new Date(notification.createdAt))}</time>}
              </div>
              {!notification.read && <button type="button" onClick={() => void markRead(notification.id)} disabled={pending !== null} className={`${buttonStyles} shrink-0`} aria-label={`Đánh dấu đã đọc: ${notification.title}`}>{pending === notification.id ? "Đang cập nhật…" : "Đánh dấu đã đọc"}</button>}
            </div>
          </li>
        ))}</ul>
      ) : (
        <section className="rounded-2xl border bg-white px-6 py-14 text-center dark:border-zinc-800 dark:bg-zinc-900"><Bell className="mx-auto mb-4 h-10 w-10 text-slate-400" aria-hidden="true" /><h2 className="text-lg font-bold">Chưa có thông báo</h2><p className="mt-2 text-sm text-slate-500 dark:text-zinc-400">Các thông báo được gửi đến tài khoản sẽ xuất hiện ở đây.</p></section>
      )}
      {result && result.meta.totalPage > 1 && <nav aria-label="Phân trang thông báo" className="flex items-center justify-center gap-3">
        <button type="button" aria-label="Trang trước" disabled={loading || pending !== null || page <= 1} onClick={() => setPagination({ accountId, page: page - 1 })} className={buttonStyles}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
        <span className="text-sm tabular-nums" aria-live="polite">Trang {page} / {result.meta.totalPage}</span>
        <button type="button" aria-label="Trang sau" disabled={loading || pending !== null || page >= result.meta.totalPage} onClick={() => setPagination({ accountId, page: page + 1 })} className={buttonStyles}><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
      </nav>}
    </div>
  );
}
