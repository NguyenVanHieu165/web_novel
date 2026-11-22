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
        style={getReaderStyleVariables(settings)}
        data-reader-theme={settings.theme}
        className="!w-full !max-w-md gap-0 overscroll-contain border-[var(--reader-border)] bg-[var(--reader-bg)] text-[var(--reader-text)] motion-reduce:animate-none motion-reduce:transition-none"
        onOpenAutoFocus={(event) => { event.preventDefault(); titleRef.current?.focus(); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus(); }}
      >
        <SheetClose asChild>
          <button type="button" aria-label="Đóng mục lục" className="absolute right-2 top-2 grid size-11 place-items-center rounded-full hover:bg-[var(--reader-surface)] focus-visible:outline-2 focus-visible:outline-[var(--reader-accent)]">
            <X className="size-5" aria-hidden="true" />
          </button>
        </SheetClose>
        <SheetHeader className="border-b border-[var(--reader-border)] pr-12">
          <SheetTitle ref={titleRef} tabIndex={-1} className="text-[var(--reader-text)] outline-none">Danh sách chương</SheetTitle>
          <SheetDescription className="text-[var(--reader-text)] opacity-70">{result?.meta.total ?? 0} chương · {storyTitle}</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 border-b border-[var(--reader-border)] p-3">
          <input
            type="search" name="reader-chapter-search" aria-label="Tìm số chương hoặc tiêu đề" maxLength={100}
            placeholder="Tìm số chương hoặc tiêu đề…" value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); setLoading(true); }}
            className="h-10 w-full rounded-lg bg-[var(--reader-surface)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--reader-accent)]"
          />
          <div className="flex items-center justify-between gap-2 text-xs">
            <button type="button" onClick={goToCurrentChapter} disabled={loading || pending}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 font-semibold hover:bg-[var(--reader-surface)] focus-visible:outline-2 focus-visible:outline-[var(--reader-accent)] disabled:opacity-40">
              <LocateFixed className="h-4 w-4" aria-hidden="true" />Chương đang đọc
            </button>
            <select name="chapter-order" aria-label="Sắp xếp mục lục" value={order}
              onChange={(event) => { setOrder(event.target.value as "asc" | "desc"); setPage(search.trim() ? 1 : null); setLoading(true); }}
              className="min-h-10 max-w-40 rounded-lg border border-[var(--reader-border)] bg-[var(--reader-bg)] px-2 text-[var(--reader-text)] focus-visible:outline-2 focus-visible:outline-[var(--reader-accent)]">
              <option value="asc">Cũ nhất trước</option><option value="desc">Mới nhất trước</option>
            </select>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3" aria-busy={loading}>
          {loading ? <p role="status" className="p-5 text-center text-sm">Đang tải mục lục…</p> : error ? (
            <div className="p-5 text-center text-sm"><p role="alert">{error}</p><button type="button" onClick={() => { setLoading(true); setRetry((value) => value + 1); }} className="mt-3 rounded-lg border px-4 py-2 focus-visible:outline-2 focus-visible:outline-[var(--reader-accent)]">Thử lại</button></div>
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
                <span className="flex shrink-0 items-center gap-1 text-xs">
                  {chapter.canRead ? <LockKeyholeOpen className="size-3.5" aria-hidden="true" /> : <LockKeyhole className="size-3.5" aria-hidden="true" />}
                  {chapter.canRead ? "VIP · Đã mở" : `VIP · Khóa · ${chapter.giaXu ?? 0} xu`}
                </span>
              )}
            </ReaderNavigationLink>
          )) : <p className="p-5 text-center text-sm">Không tìm thấy chương phù hợp.</p>}
        </div>
        <nav aria-label="Phân trang mục lục" className="flex items-center justify-between gap-3 border-t border-[var(--reader-border)] p-4 text-sm">
          <button type="button" disabled={currentPage <= 1 || loading || pending} onClick={() => { setPage(currentPage - 1); setLoading(true); }} className="min-h-10 rounded-lg border px-3 py-2 focus-visible:outline-2 focus-visible:outline-[var(--reader-accent)] disabled:opacity-40">Trước</button>
          <span className="tabular-nums" aria-live="polite">Trang {currentPage} / {totalPage}</span>
          <button type="button" disabled={!result || currentPage >= totalPage || loading || pending} onClick={() => { setPage(currentPage + 1); setLoading(true); }} className="min-h-10 rounded-lg border px-3 py-2 focus-visible:outline-2 focus-visible:outline-[var(--reader-accent)] disabled:opacity-40">Sau</button>
        </nav>
        {totalPage > 1 && <form onSubmit={jumpToPage} className="flex items-center justify-center gap-2 px-4 pb-4 text-xs">
          <label htmlFor="reader-chapter-page">Tới trang</label>
          <input key={currentPage} id="reader-chapter-page" name="page" type="number" inputMode="numeric" min={1} max={totalPage} defaultValue={currentPage}
            className="h-10 w-20 rounded-lg border border-[var(--reader-border)] bg-[var(--reader-bg)] px-2 text-[var(--reader-text)] focus-visible:outline-2 focus-visible:outline-[var(--reader-accent)]" />
          <button type="submit" disabled={loading || pending} className="min-h-10 rounded-lg border px-3 font-semibold focus-visible:outline-2 focus-visible:outline-[var(--reader-accent)] disabled:opacity-40">Đi</button>
        </form>}
      </SheetContent>
    </Sheet>
  );
}
