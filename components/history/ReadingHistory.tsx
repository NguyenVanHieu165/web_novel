"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronLeft, ChevronRight, History, RefreshCw } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { readingHistoryResponseSchema, type ReadingHistoryResponse } from "@/lib/reading-progress";
import { EmptyState, EmptyStateActions, EmptyStateDescription, EmptyStateIcon, EmptyStateTitle } from "@/components/shared/empty-state";
import { ErrorState, ErrorStateActions, ErrorStateDescription, ErrorStateTitle } from "@/components/shared/error-state";
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";

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
    <ErrorState><div><ErrorStateTitle>Không thể tải lịch sử đọc</ErrorStateTitle><ErrorStateDescription>Vui lòng kiểm tra kết nối và thử lại.</ErrorStateDescription><ErrorStateActions><Button type="button" variant="outline" onClick={() => { setError(false); setRetry((value) => value + 1); }}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" /> Thử lại
      </Button></ErrorStateActions></div></ErrorState>
  );
  if (!data) return <p className="py-16 text-center text-sm text-slate-500" role="status">Đang tải lịch sử đọc…</p>;
  if (data.data.length === 0) return (
    <EmptyState>
      <EmptyStateIcon><BookOpen aria-hidden="true" /></EmptyStateIcon>
      <EmptyStateTitle>{page === 1 ? "Bạn chưa có lịch sử đọc" : "Trang này chưa có chương đã đọc"}</EmptyStateTitle>
      <EmptyStateDescription>Tiến độ sẽ được lưu khi bạn đọc chương trong tài khoản của mình.</EmptyStateDescription>
      <EmptyStateActions>
      {page > 1 ? (
        <Button type="button" onClick={() => onPageChange(1)}>Về trang đầu</Button>
      ) : (
        <Button asChild><Link href="/truyen-moi">Khám phá truyện</Link></Button>
      )}
      </EmptyStateActions>
    </EmptyState>
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground" aria-live="polite">{data.meta.total} chương đã đọc</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {data.data.map((item) => (
          <Card key={item.chapterId} className="min-w-0 rounded-2xl"><CardContent>
            <Link href={`/truyen/${item.storySlug}`} className="line-clamp-2 text-base font-bold hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{item.storyTitle}</Link>
            <p className="mt-2 truncate text-sm text-muted-foreground">{item.chapterTitle}</p>
            <div className="my-4 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Đã đọc {Math.round(item.percent)}%</span>
                {item.updatedAt && <time dateTime={item.updatedAt}>{dateFormat.format(new Date(item.updatedAt))}</time>}
              </div>
              <progress value={item.percent} max={100} aria-label={`Tiến độ ${item.chapterTitle}`} className="h-1.5 w-full overflow-hidden rounded-full accent-blue-600" />
            </div>
            <Button asChild variant="secondary" className="w-full"><Link href={`/truyen/${item.storySlug}/${item.chapterSlug}`}>Tiếp tục đọc</Link></Button>
          </CardContent></Card>
        ))}
      </div>
      {data.meta.totalPage > 1 && (
        <Pagination aria-label="Phân trang lịch sử đọc"><PaginationContent>
          <PaginationItem><Button type="button" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft aria-hidden="true" /> Trước</Button></PaginationItem>
          <PaginationItem><span className="px-2 text-sm tabular-nums" aria-live="polite">{page} / {data.meta.totalPage}</span></PaginationItem>
          <PaginationItem><Button type="button" variant="outline" disabled={page >= data.meta.totalPage} onClick={() => onPageChange(page + 1)}>Sau <ChevronRight aria-hidden="true" /></Button></PaginationItem>
        </PaginationContent></Pagination>
      )}
    </div>
  );
}

function LoginPrompt() {
  return (
    <EmptyState><EmptyStateIcon><History aria-hidden="true" /></EmptyStateIcon><EmptyStateTitle>Đăng nhập để xem lịch sử</EmptyStateTitle><EmptyStateDescription>Lịch sử đọc được lưu riêng trong tài khoản của bạn.</EmptyStateDescription><EmptyStateActions><Button asChild><Link href="/dang-nhap?redirect=%2Flich-su">Đăng nhập</Link></Button></EmptyStateActions></EmptyState>
  );
}

export default function ReadingHistory() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState(1);
  return (
    <div className="mx-auto max-w-4xl space-y-7 py-4">
      <PageHeader><PageHeaderContent><PageHeaderEyebrow className="flex items-center gap-2 text-primary"><History aria-hidden="true" className="size-4" />Hoạt động đọc</PageHeaderEyebrow><PageHeaderTitle>Lịch Sử Đọc</PageHeaderTitle><PageHeaderDescription>Tiếp tục câu chuyện từ vị trí bạn đã lưu.</PageHeaderDescription></PageHeaderContent></PageHeader>
      {loading ? <p className="py-16 text-center text-sm text-slate-500" role="status">Đang tải tài khoản…</p> : user ? <HistoryResults key={`${user.idTaiKhoan}:${page}`} page={page} onPageChange={setPage} /> : <LoginPrompt />}
    </div>
  );
}
