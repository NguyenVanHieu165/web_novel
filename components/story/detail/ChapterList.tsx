"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Search, ArrowUpDown, BookOpen, Clock, Coins, ChevronLeft, ChevronRight, X } from "lucide-react";
import api from "@/lib/axios";
import { CHAPTER_PAGE_SIZE, chapterListPageSchema, type ChapterListPage } from "@/lib/chapter-list";
import { getChapterPath } from "@/lib/reader-navigation";
import { EmptyState, EmptyStateActions, EmptyStateDescription, EmptyStateIcon, EmptyStateTitle } from "@/components/shared/empty-state";
import { ErrorState, ErrorStateActions, ErrorStateDescription, ErrorStateTitle } from "@/components/shared/error-state";
import { FilterBar, FilterBarActions, FilterBarGroup } from "@/components/shared/filter-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";

interface ChapterListProps {
  storySlug: string;
}

type ChapterRequestState =
  | { key: string; kind: "ready"; result: ChapterListPage }
  | { key: string; kind: "error" };

const dateFormatter = new Intl.DateTimeFormat("vi-VN");

export default function ChapterList({ storySlug }: ChapterListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDesc, setIsDesc] = useState(false);
  const [requestedPage, setRequestedPage] = useState(1);
  const [requestState, setRequestState] = useState<ChapterRequestState | null>(null);
  const [retry, setRetry] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const navigationPending = useRef(false);
  const focusResults = useRef(false);
  const requestKey = JSON.stringify([storySlug, requestedPage, searchQuery, isDesc, retry]);
  const currentState = requestState?.key === requestKey ? requestState : null;
  const result = currentState?.kind === "ready" ? currentState.result : null;
  const loading = currentState === null;
  const error = currentState?.kind === "error";
  const chapters = result?.data ?? [];
  const page = result?.meta.page ?? 1;
  const total = result?.meta.total ?? 0;
  const totalPage = result?.meta.totalPage ?? 1;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await api.get<unknown>(`/truyen/${encodeURIComponent(storySlug)}/chapters`, {
          signal: controller.signal,
          params: { page: requestedPage, limit: CHAPTER_PAGE_SIZE, search: searchQuery.trim(), order: isDesc ? "desc" : "asc" },
        });
        const parsed = chapterListPageSchema.parse(response.data);
        if (!active) return;
        setRequestState({ key: requestKey, kind: "ready", result: parsed });
      } catch {
        if (active) setRequestState({ key: requestKey, kind: "error" });
      } finally {
        if (active) navigationPending.current = false;
      }
    }, searchQuery ? 250 : 0);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [storySlug, requestedPage, searchQuery, isDesc, requestKey]);

  useEffect(() => {
    if (currentState?.kind === "ready" && focusResults.current) {
      focusResults.current = false;
      if (document.activeElement === document.body) resultsRef.current?.focus();
    }
  }, [currentState]);

  const navigateToPage = (nextPage: number) => {
    if (loading || error || navigationPending.current || !Number.isInteger(nextPage)) return;
    const next = Math.min(Math.max(nextPage, 1), totalPage);
    if (next === page) return;
    navigationPending.current = true;
    focusResults.current = true;
    setRequestedPage(next);
  };

  const clearSearch = () => {
    focusResults.current = false;
    setSearchQuery("");
    setRequestedPage(1);
    searchRef.current?.focus();
  };

  const jumpToPage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("chapter-page");
    if (typeof value === "string" && value.trim()) navigateToPage(Number(value));
  };

  return (
    <div className="space-y-6" aria-busy={loading}>
      {/* Search and Sort Toolbar */}
      <FilterBar className="rounded-2xl">
        {/* Search input */}
        <FilterBarGroup><div className="relative flex-1">
          <Input
            ref={searchRef}
            type="text"
            autoComplete="off"
            maxLength={100}
            name="chapter-search"
            aria-label="Tìm chương theo tiêu đề hoặc số chương"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setRequestedPage(1);
              focusResults.current = false;
            }}
            placeholder="Số chương hoặc tiêu đề, ví dụ: Chương 1,5…"
            className="h-10 w-full rounded-xl bg-background pl-10 pr-12 text-xs sm:text-sm"
          />
          <Search aria-hidden="true" className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          {searchQuery && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Xóa từ khóa tìm chương"
              onClick={clearSearch}
              className="absolute right-2 top-1.5 text-muted-foreground"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          )}
        </div></FilterBarGroup>

        {/* Sort Toggle Button */}
        <FilterBarActions><Button
          type="button"
          variant="outline"
          onClick={() => {
            setIsDesc((current) => !current);
            setRequestedPage(1);
            focusResults.current = false;
          }}
          aria-label={isDesc ? "Mới nhất trước, chuyển sang cũ nhất trước" : "Cũ nhất trước, chuyển sang mới nhất trước"}
          className="shrink-0 rounded-xl"
        >
          <ArrowUpDown aria-hidden="true" className="w-3.5 h-3.5 text-blue-500" />
          <span>{isDesc ? "Mới nhất trước" : "Cũ nhất trước"}</span>
        </Button></FilterBarActions>
      </FilterBar>

      {/* Chapters Count Info */}
      <div ref={resultsRef} tabIndex={-1} role="status" aria-live="polite" aria-atomic="true" className="flex items-center justify-between rounded-md text-xs text-slate-500 dark:text-zinc-400 px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        <span>{loading ? "Đang tải danh sách chương…" : error ? "Danh sách chương chưa tải được." : `Hiển thị ${chapters.length} / ${total} chương · Trang ${page} / ${totalPage}`}</span>
      </div>

      {/* Chapter Grid */}
      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500" aria-hidden="true">Đang tải chương…</div>
      ) : error ? (
        <ErrorState><div><ErrorStateTitle>Không thể tải danh sách chương</ErrorStateTitle><ErrorStateDescription>Vui lòng kiểm tra kết nối và thử lại.</ErrorStateDescription><ErrorStateActions><Button type="button" variant="outline" onClick={() => setRetry((value) => value + 1)}>Thử lại</Button></ErrorStateActions></div></ErrorState>
      ) : chapters.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {chapters.map((chap) => (
            <Link
              prefetch={false}
              key={chap.idChuong}
              href={getChapterPath(storySlug, chap.slug)}
              className="flex items-center justify-between p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800/90 hover:border-blue-500/50 hover:shadow-md hover:shadow-blue-500/5 dark:hover:border-blue-500/30 transition-[border-color,box-shadow] duration-150 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <div className="min-w-0 flex-1 pr-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-zinc-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                    {chap.tieuDeChuong}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 dark:text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Clock aria-hidden="true" className="w-3 h-3" />
                    {chap.updatedAt && !Number.isNaN(Date.parse(chap.updatedAt)) ? dateFormatter.format(new Date(chap.updatedAt)) : ""}
                  </span>
                </div>
              </div>

              {/* Status Badge: Free / VIP Xu */}
              <div className="shrink-0 flex items-center gap-1">
                {chap.isFree !== false ? (
                  <Badge variant="success" className="rounded-md text-[10px] font-bold">
                    Miễn phí
                  </Badge>
                ) : (
                  <Badge variant="warning" className="rounded-md text-[10px] font-bold">
                    <Coins aria-hidden="true" className="w-3 h-3" />
                    {chap.giaXu ?? 0} xu
                  </Badge>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState>
          <EmptyStateIcon><BookOpen aria-hidden="true" /></EmptyStateIcon>
          <EmptyStateTitle>{searchQuery.trim() ? "Không tìm thấy chương" : "Truyện chưa có chương"}</EmptyStateTitle>
          <EmptyStateDescription>{searchQuery.trim() ? "Không có chương nào phù hợp với từ khóa hiện tại." : "Danh sách chương sẽ xuất hiện khi tác giả đăng nội dung."}</EmptyStateDescription>
          {searchQuery.trim() && <EmptyStateActions><Button type="button" variant="outline" onClick={clearSearch}>Xóa từ khóa tìm kiếm</Button></EmptyStateActions>}
        </EmptyState>
      )}

      {!loading && !error && totalPage > 1 && (
        <Pagination aria-label="Phân trang danh sách chương"><PaginationContent className="flex-wrap gap-3">
          <PaginationItem><Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Trang trước"
            disabled={page <= 1}
            onClick={() => navigateToPage(page - 1)}
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </Button></PaginationItem>
          <PaginationItem><span className="px-2 text-sm tabular-nums">Trang {page} / {totalPage}</span></PaginationItem>
          <PaginationItem><Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Trang sau"
            disabled={page >= totalPage}
            onClick={() => navigateToPage(page + 1)}
          >
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </Button></PaginationItem>
          {totalPage > 5 && (
            <PaginationItem><form onSubmit={jumpToPage} className="flex items-center gap-2 text-sm">
              <label className="flex items-center gap-2">
                Đến trang
                <Input
                  key={`${requestKey}:${page}`}
                  name="chapter-page"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={totalPage}
                  step={1}
                  defaultValue={page}
                  required
                  className="w-20 tabular-nums"
                />
              </label>
              <Button type="submit" variant="outline">Đi</Button>
            </form></PaginationItem>
          )}
        </PaginationContent></Pagination>
      )}
    </div>
  );
}
