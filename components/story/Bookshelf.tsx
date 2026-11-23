"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookMarked, BookOpen, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { z } from "zod";

import { useAuth } from "@/context/AuthContext";
import { EmptyState, EmptyStateActions, EmptyStateDescription, EmptyStateIcon, EmptyStateTitle } from "@/components/shared/empty-state";
import { ErrorState, ErrorStateActions, ErrorStateDescription, ErrorStateTitle } from "@/components/shared/error-state";
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";

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
      <PageHeader><PageHeaderContent><PageHeaderEyebrow className="flex items-center gap-2 text-primary"><BookMarked aria-hidden="true" className="size-4" />Truyện bạn đang theo dõi</PageHeaderEyebrow><PageHeaderTitle>Tủ Sách Của Bạn</PageHeaderTitle><PageHeaderDescription>Theo dõi một tác phẩm để lưu vào tủ sách và tìm lại khi muốn đọc.</PageHeaderDescription></PageHeaderContent>
        <PageHeaderActions>
        {user && !requiresLogin && (
          <Button type="button" variant="outline" onClick={() => setRetry((value) => value + 1)} disabled={loading}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Làm mới
          </Button>
        )}
        </PageHeaderActions>
      </PageHeader>

      {loading ? (
        <div role="status" aria-label="Đang tải tủ sách" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-48 rounded-2xl bg-slate-200/70 motion-safe:animate-pulse dark:bg-zinc-800" />
          ))}
        </div>
      ) : requiresLogin ? (
        <EmptyState><EmptyStateIcon><BookMarked aria-hidden="true" /></EmptyStateIcon><EmptyStateTitle>Đăng nhập để xem tủ sách</EmptyStateTitle><EmptyStateDescription>Tủ sách được lưu riêng trong tài khoản để bạn có thể đọc trên nhiều thiết bị.</EmptyStateDescription><EmptyStateActions><Button asChild><Link href="/dang-nhap?redirect=%2Ftu-sach">Đăng nhập</Link></Button></EmptyStateActions></EmptyState>
      ) : currentState?.kind === "error" ? (
        <ErrorState><div><ErrorStateTitle>Không thể tải tủ sách</ErrorStateTitle><ErrorStateDescription>Vui lòng kiểm tra kết nối và thử lại.</ErrorStateDescription><ErrorStateActions><Button type="button" variant="outline" onClick={() => setRetry((value) => value + 1)}>Thử lại</Button></ErrorStateActions></div></ErrorState>
      ) : result && result.data.length > 0 ? (
        <>
          <p className="text-sm tabular-nums text-muted-foreground" aria-live="polite">{result.meta.total.toLocaleString("vi-VN")} truyện trong tủ sách</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.data.map(({ id, followedAt, story }) => (
              <Link
                key={id}
                href={`/truyen/${story.slug}`}
                className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="h-full flex-row gap-4 rounded-2xl p-4 transition-colors group-hover:border-primary/60">
                <div className="h-36 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-zinc-800">
                  {story.cover ? (
                    // Covers use existing external URLs, which are not restricted to Next image hosts.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={story.cover} alt={story.tenTruyen} width={96} height={144} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  ) : <BookOpen className="m-auto h-full w-8 text-slate-400" aria-hidden="true" />}
                </div>
                <div className="min-w-0 space-y-2">
                  <h2 className="line-clamp-2 text-base font-bold group-hover:text-primary">{story.tenTruyen}</h2>
                  <Badge variant={story.completed ? "success" : "info"}>{story.completed ? "Đã hoàn thành" : "Đang cập nhật"}</Badge>
                  <p className="text-sm tabular-nums text-muted-foreground">{story.chapters.toLocaleString("vi-VN")} chương</p>
                  {followedAt && <p className="text-xs text-muted-foreground">Theo dõi từ {dateFormat.format(new Date(followedAt))}</p>}
                  <span className="inline-flex pt-1 text-xs font-bold text-primary">Xem truyện →</span>
                </div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <EmptyState><EmptyStateIcon><BookOpen aria-hidden="true" /></EmptyStateIcon><EmptyStateTitle>Tủ sách chưa có truyện</EmptyStateTitle><EmptyStateDescription>Nhấn “Theo dõi” ở trang truyện bạn yêu thích để lưu tại đây.</EmptyStateDescription><EmptyStateActions><Button asChild variant="outline"><Link href="/truyen-moi">Khám phá truyện mới</Link></Button></EmptyStateActions></EmptyState>
      )}

      {result && result.meta.totalPage > 1 && (
        <Pagination aria-label="Phân trang tủ sách"><PaginationContent>
          <PaginationItem><Button type="button" variant="outline" size="icon" aria-label="Trang trước" disabled={loading || page <= 1} onClick={() => setPagination({ accountId, page: page - 1 })}><ChevronLeft aria-hidden="true" /></Button></PaginationItem>
          <PaginationItem><span className="px-2 text-sm tabular-nums" aria-live="polite">Trang {page} / {result.meta.totalPage}</span></PaginationItem>
          <PaginationItem><Button type="button" variant="outline" size="icon" aria-label="Trang sau" disabled={loading || page >= result.meta.totalPage} onClick={() => setPagination({ accountId, page: page + 1 })}><ChevronRight aria-hidden="true" /></Button></PaginationItem>
        </PaginationContent></Pagination>
      )}
    </div>
  );
}
