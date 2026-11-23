"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { z } from "zod";

import { useAuth } from "@/context/AuthContext";
import { EmptyState, EmptyStateActions, EmptyStateDescription, EmptyStateIcon, EmptyStateTitle } from "@/components/shared/empty-state";
import { ErrorState, ErrorStateActions, ErrorStateDescription, ErrorStateTitle } from "@/components/shared/error-state";
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from "@/components/shared/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";

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
      <PageHeader><PageHeaderContent><PageHeaderEyebrow className="flex items-center gap-2 text-primary"><Bell aria-hidden="true" className="size-4" />Cập nhật dành cho bạn</PageHeaderEyebrow><PageHeaderTitle>Thông Báo</PageHeaderTitle>{result && <PageHeaderDescription aria-live="polite">{result.meta.unread.toLocaleString("vi-VN")} chưa đọc · {result.meta.total.toLocaleString("vi-VN")} thông báo</PageHeaderDescription>}</PageHeaderContent>
        {user && !requiresLogin && <PageHeaderActions>
          <Button type="button" variant="outline" onClick={() => setRetry((value) => value + 1)} disabled={loading || pending !== null}><RefreshCw aria-hidden="true" />Làm mới</Button>
          <Button type="button" variant="outline" onClick={() => void markRead("all")} disabled={loading || pending !== null || !result?.meta.unread}><CheckCheck aria-hidden="true" />{pending === "all" ? "Đang cập nhật…" : "Đọc tất cả"}</Button>
        </PageHeaderActions>}
      </PageHeader>

      {mutationError?.key === key && <Alert variant="destructive"><AlertDescription>{mutationError.message}</AlertDescription></Alert>}
      {loading ? (
        <div className="space-y-3" role="status" aria-label="Đang tải thông báo">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-28 rounded-2xl bg-slate-200/70 motion-safe:animate-pulse dark:bg-zinc-800" />)}</div>
      ) : requiresLogin ? (
        <EmptyState><EmptyStateIcon><Bell aria-hidden="true" /></EmptyStateIcon><EmptyStateTitle>Đăng nhập để xem thông báo</EmptyStateTitle><EmptyStateDescription>Thông báo của bạn chỉ hiển thị trong tài khoản của bạn.</EmptyStateDescription><EmptyStateActions><Button asChild><Link href="/dang-nhap?redirect=%2Fthong-bao">Đăng nhập</Link></Button></EmptyStateActions></EmptyState>
      ) : currentState?.kind === "error" ? (
        <ErrorState><div><ErrorStateTitle>Không thể tải thông báo</ErrorStateTitle><ErrorStateDescription>Vui lòng kiểm tra kết nối và thử lại.</ErrorStateDescription><ErrorStateActions><Button type="button" variant="outline" onClick={() => setRetry((value) => value + 1)}>Thử lại</Button></ErrorStateActions></div></ErrorState>
      ) : result && result.data.length > 0 ? (
        <ul className="space-y-3">{result.data.map((notification) => (
          <li key={notification.id}><Card className={notification.read ? "rounded-2xl" : "rounded-2xl border-primary/30 bg-primary/5"}><CardContent>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="break-words text-base font-bold">{!notification.read && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-blue-500" aria-label="Chưa đọc" />}{notification.title}</h2>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{notification.content}</p>
                {notification.createdAt && <time dateTime={notification.createdAt} className="mt-3 block text-xs text-muted-foreground">{dateFormat.format(new Date(notification.createdAt))}</time>}
              </div>
              {!notification.read && <Button type="button" variant="outline" onClick={() => void markRead(notification.id)} disabled={pending !== null} className="shrink-0" aria-label={`Đánh dấu đã đọc: ${notification.title}`}>{pending === notification.id ? "Đang cập nhật…" : "Đánh dấu đã đọc"}</Button>}
            </div>
          </CardContent></Card></li>
        ))}</ul>
      ) : (
        <EmptyState><EmptyStateIcon><Bell aria-hidden="true" /></EmptyStateIcon><EmptyStateTitle>Chưa có thông báo</EmptyStateTitle><EmptyStateDescription>Các thông báo được gửi đến tài khoản sẽ xuất hiện ở đây.</EmptyStateDescription></EmptyState>
      )}
      {result && result.meta.totalPage > 1 && <Pagination aria-label="Phân trang thông báo"><PaginationContent>
        <PaginationItem><Button type="button" variant="outline" size="icon" aria-label="Trang trước" disabled={loading || pending !== null || page <= 1} onClick={() => setPagination({ accountId, page: page - 1 })}><ChevronLeft aria-hidden="true" /></Button></PaginationItem>
        <PaginationItem><span className="px-2 text-sm tabular-nums" aria-live="polite">Trang {page} / {result.meta.totalPage}</span></PaginationItem>
        <PaginationItem><Button type="button" variant="outline" size="icon" aria-label="Trang sau" disabled={loading || pending !== null || page >= result.meta.totalPage} onClick={() => setPagination({ accountId, page: page + 1 })}><ChevronRight aria-hidden="true" /></Button></PaginationItem>
      </PaginationContent></Pagination>}
    </div>
  );
}
