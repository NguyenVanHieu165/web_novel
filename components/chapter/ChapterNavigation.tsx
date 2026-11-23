"use client";

import { useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import type { NavChapterItem } from "@/lib/mappers/chapter.mapper";
import { getChapterPath, readerKeyboardDirection } from "@/lib/reader-navigation";
import { ReaderNavigationLink, useReaderNavigation } from "./ReaderNavigationProvider";
import { Button } from "@/components/ui/button";

interface ChapterNavigationProps {
  storySlug: string;
  prevChapter: NavChapterItem | null;
  nextChapter: NavChapterItem | null;
  disableShortcut?: boolean;
  children?: ReactNode;
}

const linkStyles = "min-h-11 rounded-xl border-[var(--reader-border)] bg-transparent px-3 py-2.5 text-xs font-bold text-[var(--reader-text)] hover:bg-[var(--reader-surface)] hover:text-[var(--reader-text)] focus-visible:border-[var(--reader-accent)] focus-visible:ring-[var(--reader-accent)]/40 sm:px-4 sm:text-sm";

export default function ChapterNavigation({ storySlug, prevChapter, nextChapter, disableShortcut = false, children }: ChapterNavigationProps) {
  const { navigate, pending } = useReaderNavigation();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const interactive = target instanceof Element && Boolean(
        target.closest("input, textarea, select, button, a, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='dialog'], [role='menu'], [role='slider']"),
      );
      const direction = readerKeyboardDirection({ key: event.key,
        defaultPrevented: event.defaultPrevented, repeat: event.repeat, isComposing: event.isComposing,
        altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey,
        interactive, blocked: disableShortcut || pending,
      });
      const destination = direction === "previous" ? prevChapter : direction === "next" ? nextChapter : null;
      if (!destination) return;
      event.preventDefault();
      navigate(getChapterPath(storySlug, destination.slug));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [disableShortcut, pending, prevChapter, nextChapter, navigate, storySlug]);

  return (
    <div className="mt-12 space-y-3 border-t pt-6" style={{ borderColor: "var(--reader-border)" }}>
      <nav aria-label="Điều hướng chương" aria-busy={pending} className="flex flex-wrap items-center justify-between gap-3">
        {prevChapter ? (
          <Button asChild variant="outline" className={`${linkStyles} ${pending ? "cursor-wait opacity-50" : ""}`}>
            <ReaderNavigationLink
              href={getChapterPath(storySlug, prevChapter.slug)}
              title={prevChapter.tieuDeChuong}
              aria-label={`Chương trước: ${prevChapter.tieuDeChuong}`}
              aria-keyshortcuts="ArrowLeft"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />Chương trước
            </ReaderNavigationLink>
          </Button>
        ) : <span className="px-3 py-2.5 text-xs font-semibold opacity-50 sm:text-sm">Chương đầu</span>}
        {children}
        {nextChapter ? (
          <Button asChild className={`${linkStyles} border-[var(--reader-accent)] bg-[var(--reader-accent)] text-[var(--reader-surface)] hover:bg-[var(--reader-accent)] hover:text-[var(--reader-surface)] hover:opacity-90 ${pending ? "cursor-wait opacity-50" : ""}`}>
            <ReaderNavigationLink
              href={getChapterPath(storySlug, nextChapter.slug)}
              title={nextChapter.tieuDeChuong}
              aria-label={`Chương sau: ${nextChapter.tieuDeChuong}`}
              aria-keyshortcuts="ArrowRight"
            >
              Chương sau<ChevronRight className="h-4 w-4" aria-hidden="true" />
            </ReaderNavigationLink>
          </Button>
        ) : <span className="px-3 py-2.5 text-xs font-semibold opacity-50 sm:text-sm">Chương mới nhất</span>}
      </nav>
      <div className="min-h-5 text-center text-xs opacity-70" aria-hidden={pending ? "true" : undefined}>
        {pending ? <span className="inline-flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />Đang chuyển chương…</span> : "Dùng phím ← / → để chuyển chương khi đang đọc."}
      </div>
    </div>
  );
}
