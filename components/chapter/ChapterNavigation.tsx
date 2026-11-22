"use client";

import { useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import type { NavChapterItem } from "@/lib/mappers/chapter.mapper";
import { getChapterPath, readerKeyboardDirection } from "@/lib/reader-navigation";
import { ReaderNavigationLink, useReaderNavigation } from "./ReaderNavigationProvider";

interface ChapterNavigationProps {
  storySlug: string;
  prevChapter: NavChapterItem | null;
  nextChapter: NavChapterItem | null;
  disableShortcut?: boolean;
  children?: ReactNode;
}

const linkStyles = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:px-4 sm:text-sm";

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
          <ReaderNavigationLink
            href={getChapterPath(storySlug, prevChapter.slug)}
            title={prevChapter.tieuDeChuong}
            aria-keyshortcuts="ArrowLeft"
            className={`${linkStyles} ${pending ? "cursor-wait opacity-50" : ""}`}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />Chương trước
          </ReaderNavigationLink>
        ) : <span className="px-3 py-2.5 text-xs font-semibold opacity-50 sm:text-sm">Chương đầu</span>}
        {children}
        {nextChapter ? (
          <ReaderNavigationLink
            href={getChapterPath(storySlug, nextChapter.slug)}
            title={nextChapter.tieuDeChuong}
            aria-keyshortcuts="ArrowRight"
            className={`${linkStyles} border-blue-600 bg-blue-600 text-white hover:bg-blue-700 ${pending ? "cursor-wait opacity-50" : ""}`}
          >
            Chương sau<ChevronRight className="h-4 w-4" aria-hidden="true" />
          </ReaderNavigationLink>
        ) : <span className="px-3 py-2.5 text-xs font-semibold opacity-50 sm:text-sm">Chương mới nhất</span>}
      </nav>
      <div className="min-h-5 text-center text-xs opacity-70" aria-hidden={pending ? "true" : undefined}>
        {pending ? <span className="inline-flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />Đang chuyển chương…</span> : "Dùng phím ← / → để chuyển chương khi đang đọc."}
      </div>
    </div>
  );
}
