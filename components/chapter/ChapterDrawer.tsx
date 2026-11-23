"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { ReaderNavigationLink, useReaderNavigation } from "./ReaderNavigationProvider";
import { useReaderPreferences } from "./ReaderAppearance";
import { getReaderStyleVariables } from "@/lib/reader-settings";
import { chapterListPageSchema, CHAPTER_PAGE_SIZE, type ChapterListPage } from "@/lib/chapter-list";
import { getChapterPath } from "@/lib/reader-navigation";
import { LockKeyhole, LockKeyholeOpen, LocateFixed, X } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { normalizeVietnameseText } from "@/lib/vietnamese-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ChapterDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storySlug: string;
  storyTitle: string;
  chapterId: number;
  triggerRef: RefObject<HTMLButtonElement | null>;
}

export default function ChapterDrawer({ open, onOpenChange, storySlug, storyTitle, chapterId, triggerRef }: ChapterDrawerProps) {
  const { settings } = useReaderPreferences();
  const { pending } = useReaderNavigation();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState<number | null>(null);
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [result, setResult] = useState<ChapterListPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const currentLinkRef = useRef<HTMLAnchorElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const currentPage = result?.meta.page ?? page ?? 1;
  const totalPage = result?.meta.totalPage ?? 1;
  const readerStyle = getReaderStyleVariables(settings);

  const goToCurrentChapter = () => {
    setSearch("");
    setPage(null);
    setLoading(true);
    setRetry((value) => value + 1);
  };

  const jumpToPage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const destination = Number(new FormData(event.currentTarget).get("page"));
    if (!Number.isInteger(destination) || destination < 1 || destination > totalPage || destination === currentPage) return;
    setPage(destination);
    setLoading(true);
  };

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({ limit: String(CHAPTER_PAGE_SIZE), search: search.trim(), order, includeAccess: "1" });
        if (page === null && !search.trim()) query.set("chapterId", String(chapterId));
        else query.set("page", String(page ?? 1));
        const response = await fetch(`/api/truyen/${encodeURIComponent(storySlug)}/chapters?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Không thể tải mục lục. Hãy thử lại.");
        const data = chapterListPageSchema.parse(await response.json());
        if (!controller.signal.aborted) setResult(data);
      } catch {
        if (!controller.signal.aborted) setError("Không thể tải mục lục. Hãy kiểm tra kết nối và thử lại.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, search ? 250 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [open, storySlug, chapterId, page, search, order, retry]);

  useEffect(() => {
    if (open && !loading && !error) currentLinkRef.current?.scrollIntoView({ block: "nearest" });
  }, [open, loading, error, result]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        showCloseButton={false}
        style={readerStyle}
        data-reader-theme={settings.theme}
        className="!w-full !max-w-md gap-0 overscroll-contain border-[var(--reader-border)] bg-[var(--reader-bg)] text-[var(--reader-text)] motion-reduce:animate-none motion-reduce:transition-none"
        onOpenAutoFocus={(event) => { event.preventDefault(); titleRef.current?.focus(); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus(); }}
      >
        <SheetClose asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="Đóng mục lục" className="absolute right-2 top-2 size-11 rounded-full text-[var(--reader-text)] hover:bg-[var(--reader-surface)] hover:text-[var(--reader-text)] focus-visible:border-[var(--reader-accent)] focus-visible:ring-[var(--reader-accent)]/40">
            <X className="size-5" aria-hidden="true" />
          </Button>
        </SheetClose>
        <SheetHeader className="border-b border-[var(--reader-border)] pr-12">
          <SheetTitle ref={titleRef} tabIndex={-1} className="text-[var(--reader-text)] outline-none">Danh sách chương</SheetTitle>
          <SheetDescription className="text-[var(--reader-text)] opacity-70">{result?.meta.total ?? 0} chương · {storyTitle}</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 border-b border-[var(--reader-border)] p-3">
          <Input
            type="search" name="reader-chapter-search" aria-label="Tìm số chương hoặc tiêu đề" maxLength={100}
            placeholder="Tìm số chương hoặc tiêu đề…" value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); setLoading(true); }}
            className="h-10 border-[var(--reader-border)] bg-[var(--reader-surface)] text-[var(--reader-text)] placeholder:text-[var(--reader-text)]/55 focus-visible:border-[var(--reader-accent)] focus-visible:ring-[var(--reader-accent)]/40"
          />
          <div className="flex items-center justify-between gap-2 text-xs">
            <Button type="button" variant="ghost" onClick={goToCurrentChapter} disabled={loading || pending}
              className="min-h-10 px-2 text-xs font-semibold text-[var(--reader-text)] hover:bg-[var(--reader-surface)] hover:text-[var(--reader-text)] focus-visible:border-[var(--reader-accent)] focus-visible:ring-[var(--reader-accent)]/40 disabled:opacity-40">
              <LocateFixed className="h-4 w-4" aria-hidden="true" />Chương đang đọc
            </Button>
            <Select value={order} onValueChange={(value) => {
              if (value !== "asc" && value !== "desc") return;
              setOrder(value); setPage(search.trim() ? 1 : null); setLoading(true);
            }}>
              <SelectTrigger aria-label="Sắp xếp mục lục" className="min-h-10 max-w-40 border-[var(--reader-border)] bg-[var(--reader-bg)] text-[var(--reader-text)] hover:bg-[var(--reader-surface)] focus-visible:border-[var(--reader-accent)] focus-visible:ring-[var(--reader-accent)]/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="end" style={readerStyle} data-reader-theme={settings.theme} className="border-[var(--reader-border)] bg-[var(--reader-surface)] text-[var(--reader-text)]">
                <SelectItem value="asc" className="focus:bg-[var(--reader-bg)] focus:text-[var(--reader-text)]">Cũ nhất trước</SelectItem>
                <SelectItem value="desc" className="focus:bg-[var(--reader-bg)] focus:text-[var(--reader-text)]">Mới nhất trước</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3" aria-busy={loading}>
          {loading ? <p role="status" className="p-5 text-center text-sm">Đang tải mục lục…</p> : error ? (
            <Alert variant="destructive" role="alert" className="border-[var(--reader-error)]/30 bg-transparent text-[var(--reader-error)]">
              <AlertDescription>{error}</AlertDescription>
              <Button type="button" variant="outline" onClick={() => { setLoading(true); setRetry((value) => value + 1); }} className="col-start-2 mt-2 w-fit border-[var(--reader-border)] bg-transparent text-[var(--reader-text)] hover:bg-[var(--reader-surface)] hover:text-[var(--reader-text)] focus-visible:border-[var(--reader-accent)] focus-visible:ring-[var(--reader-accent)]/40">Thử lại</Button>
            </Alert>
          ) : result?.data.length ? result.data.map((chapter) => (
            <ReaderNavigationLink key={chapter.idChuong} href={getChapterPath(storySlug, chapter.slug)}
              ref={chapter.idChuong === chapterId ? currentLinkRef : undefined}
              onClick={(event) => {
                if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) {
                  if (chapter.idChuong === chapterId) event.preventDefault();
                  onOpenChange(false);
                }
              }} aria-current={chapter.idChuong === chapterId ? "page" : undefined}
              className={`flex items-center justify-between gap-3 rounded-lg p-3 text-sm focus-visible:ring-2 focus-visible:ring-blue-500 ${chapter.idChuong === chapterId ? "bg-blue-600 text-white" : "hover:bg-[var(--reader-surface)]"}`}>
              <span className="truncate" title={normalizeVietnameseText(chapter.tieuDeChuong)}>{normalizeVietnameseText(chapter.tieuDeChuong || `Chương ${chapter.chuongSo}`)}</span>
              {chapter.isFree === false && (
                <Badge variant="outline" className="shrink-0 border-current bg-transparent text-current">
                  {chapter.canRead ? <LockKeyholeOpen className="size-3.5" aria-hidden="true" /> : <LockKeyhole className="size-3.5" aria-hidden="true" />}
                  {chapter.canRead ? "VIP · Đã mở" : `VIP · Khóa · ${chapter.giaXu ?? 0} xu`}
                </Badge>
              )}
            </ReaderNavigationLink>
          )) : <p className="p-5 text-center text-sm">Không tìm thấy chương phù hợp.</p>}
        </div>
        <Pagination aria-label="Phân trang mục lục" className="border-t border-[var(--reader-border)] p-4 text-sm">
          <PaginationContent className="w-full justify-between gap-3">
            <PaginationItem><Button type="button" variant="outline" disabled={currentPage <= 1 || loading || pending} onClick={() => { setPage(currentPage - 1); setLoading(true); }} className="min-h-10 border-[var(--reader-border)] bg-transparent text-[var(--reader-text)] hover:bg-[var(--reader-surface)] hover:text-[var(--reader-text)] focus-visible:border-[var(--reader-accent)] focus-visible:ring-[var(--reader-accent)]/40">Trước</Button></PaginationItem>
            <PaginationItem><span className="tabular-nums" aria-live="polite">Trang {currentPage} / {totalPage}</span></PaginationItem>
            <PaginationItem><Button type="button" variant="outline" disabled={!result || currentPage >= totalPage || loading || pending} onClick={() => { setPage(currentPage + 1); setLoading(true); }} className="min-h-10 border-[var(--reader-border)] bg-transparent text-[var(--reader-text)] hover:bg-[var(--reader-surface)] hover:text-[var(--reader-text)] focus-visible:border-[var(--reader-accent)] focus-visible:ring-[var(--reader-accent)]/40">Sau</Button></PaginationItem>
          </PaginationContent>
        </Pagination>
        {totalPage > 1 && <form onSubmit={jumpToPage} className="flex items-center justify-center gap-2 px-4 pb-4 text-xs">
          <label htmlFor="reader-chapter-page">Tới trang</label>
          <Input key={currentPage} id="reader-chapter-page" name="page" type="number" inputMode="numeric" min={1} max={totalPage} defaultValue={currentPage}
            className="h-10 w-20 border-[var(--reader-border)] bg-[var(--reader-bg)] text-[var(--reader-text)] focus-visible:border-[var(--reader-accent)] focus-visible:ring-[var(--reader-accent)]/40" />
          <Button type="submit" variant="outline" disabled={loading || pending} className="min-h-10 border-[var(--reader-border)] bg-transparent text-[var(--reader-text)] hover:bg-[var(--reader-surface)] hover:text-[var(--reader-text)] focus-visible:border-[var(--reader-accent)] focus-visible:ring-[var(--reader-accent)]/40">Đi</Button>
        </form>}
      </SheetContent>
    </Sheet>
  );
}
