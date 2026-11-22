"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowDown, ArrowUp, Bookmark, ChevronLeft, ChevronRight, Headphones, List, Settings2 } from "lucide-react";
import { toast } from "sonner";
import type { ChapterDetailData } from "@/lib/mappers/chapter.mapper";
import { measureReadingProgress } from "@/lib/reader-progress-state";
import { findReaderTypographyAnchor } from "@/lib/reader-typography-anchor";
import { getChapterPath } from "@/lib/reader-navigation";
import { ReaderNavigationLink } from "./ReaderNavigationProvider";
import dynamic from "next/dynamic";
import { hasAudioContinuation } from "@/lib/tts/audio-continuation";
import { AudioPlayerSkeleton } from "@/components/common/InteractionSkeleton";

const ChapterAudioPlayer = dynamic(() => import("@/components/reading/ChapterAudioPlayer"), { ssr: false, loading: AudioPlayerSkeleton });

const control = "grid size-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-[var(--reader-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--reader-accent)] disabled:cursor-not-allowed disabled:opacity-30 md:size-11";
const surface = "border border-[var(--reader-border)] bg-[var(--reader-surface)] text-[var(--reader-text)] shadow-lg shadow-black/10";

export default function ReadingDock({ data, drawerTriggerRef, settingsTriggerRef, panel, onPanelChange }: {
  data: ChapterDetailData;
  drawerTriggerRef: RefObject<HTMLButtonElement | null>;
  settingsTriggerRef: RefObject<HTMLButtonElement | null>;
  panel: "contents" | "settings" | "speech" | null;
  onPanelChange: (panel: "contents" | "settings" | "speech" | null) => void;
}) {
  const { chapter, story, prevChapter, nextChapter, access } = data;
  const [collapsed, setCollapsed] = useState(false);
  const [bookmark, setBookmark] = useState<number | null>(null);
  const percentRef = useRef<HTMLOutputElement>(null);
  const storageKey = `web-novel:bookmark:v1:${chapter.idChuong}`;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const speechTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (access.canRead && hasAudioContinuation(getChapterPath(story.slug, chapter.slug))) {
      queueMicrotask(() => onPanelChange("speech"));
    }
  }, [access.canRead, story.slug, chapter.slug, onPanelChange]);

  useEffect(() => {
    const article = document.getElementById("reader-content");
    if (!article) return;
    let frame = 0;
    let last = -1;
    const measure = () => {
      frame = 0;
      const rect = article.getBoundingClientRect();
      const percent = Math.round(measureReadingProgress({ scrollY: window.scrollY, contentTop: rect.top + window.scrollY, contentHeight: article.scrollHeight, viewportHeight: window.innerHeight }).percent);
      if (percentRef.current && percent !== last) percentRef.current.textContent = `${percent}%`;
      last = percent;
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(article);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const value: unknown = raw ? JSON.parse(raw) : null;
      if (typeof value === "number" && Number.isInteger(value) && value >= 0 &&
        value < (document.getElementById("reader-content")?.children.length ?? 0)) {
        // Browser state is loaded after hydration.
        queueMicrotask(() => setBookmark(value));
      }
    } catch { /* A bookmark remains optional when browser storage is unavailable. */ }
  }, [storageKey]);

  const scrollTo = (end: boolean) => {
    const target = document.getElementById(end ? "reader-end" : "reader-main");
    target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  };
  const saveBookmark = () => {
    const article = document.getElementById("reader-content");
    if (!article?.children.length) return;
    const anchor = findReaderTypographyAnchor({ count: article.children.length, readRect: (index) => article.children[index].getBoundingClientRect(), articleRect: article.getBoundingClientRect(), viewportHeight: window.innerHeight });
    const index = anchor?.index ?? (article.getBoundingClientRect().top > 80 ? 0 : article.children.length - 1);
    try {
      localStorage.setItem(storageKey, JSON.stringify(index));
      setBookmark(index);
      toast.success("Đã đánh dấu đoạn đang đọc trên trình duyệt này.");
    } catch {
      toast.error("Không thể lưu đánh dấu. Hãy cho phép trình duyệt lưu dữ liệu.");
    }
  };
  const resume = () => {
    if (bookmark === null) return;
    const paragraph = document.getElementById("reader-content")?.children[bookmark];
    paragraph?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
  };
  const closeSpeech = () => { onPanelChange(null); speechTriggerRef.current?.focus(); };

  return (
    <>
      {bookmark !== null && access.canRead && <aside className={`mx-auto mb-4 flex max-w-[var(--reader-width)] items-center justify-between gap-3 rounded-xl p-3 text-sm ${surface}`}>
        <span>Đã lưu một đoạn trong chương này.</span>
        <button type="button" onClick={resume} className="min-h-11 rounded-lg px-3 font-semibold hover:underline focus-visible:outline-2">Tới đoạn đã lưu</button>
      </aside>}
      <div className={`fixed inset-x-2 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-40 flex justify-center transition-transform duration-300 motion-reduce:transition-none md:inset-x-auto md:bottom-auto md:right-4 md:top-1/2 md:max-h-[calc(100dvh-2rem)] md:-translate-y-1/2 md:overflow-y-auto md:rounded-full ${panel || collapsed ? "" : "max-md:group-data-[reader-chrome=hidden]/reader-chrome:translate-y-[calc(100%+2rem)] max-md:focus-within:!translate-y-0"}`}>
        <div className={`flex max-w-full items-start gap-1 md:flex-col md:items-center md:gap-3 ${collapsed ? "ml-auto" : ""}`}>
          <nav aria-label="Công cụ đọc" className={`flex max-w-full flex-wrap items-center justify-center rounded-3xl p-1 md:flex-col md:flex-nowrap md:rounded-full md:p-1.5 ${surface}`}>
            <button ref={toggleRef} type="button" aria-expanded={!collapsed} aria-label={collapsed ? "Mở rộng công cụ đọc" : "Thu gọn công cụ đọc"} className={control} onClick={() => { setCollapsed(!collapsed); toggleRef.current?.focus(); }}>
              {collapsed ? <ChevronLeft className="size-5" aria-hidden="true" /> : <ChevronRight className="size-5" aria-hidden="true" />}
            </button>
            {!collapsed && <>
              <button ref={drawerTriggerRef} type="button" aria-label="Mục lục chương" aria-haspopup="dialog" aria-expanded={panel === "contents"} className={control} onClick={() => onPanelChange("contents")}><List className="size-5" aria-hidden="true" /></button>
              <button ref={settingsTriggerRef} type="button" aria-label="Cài đặt đọc" aria-haspopup="dialog" aria-expanded={panel === "settings"} className={control} onClick={() => onPanelChange("settings")}><Settings2 className="size-5" aria-hidden="true" /></button>
              <button ref={speechTriggerRef} type="button" disabled={!access.canRead} aria-label="Nghe đọc truyện" aria-expanded={panel === "speech"} className={control} onClick={() => onPanelChange(panel === "speech" ? null : "speech")}><Headphones className="size-5" aria-hidden="true" /></button>
              {prevChapter ? <ReaderNavigationLink href={getChapterPath(story.slug, prevChapter.slug)} aria-label="Chương trước" title={prevChapter.tieuDeChuong} className={control}><ChevronLeft className="size-5" aria-hidden="true" /></ReaderNavigationLink> : <button type="button" disabled aria-label="Đang ở chương đầu" className={control}><ChevronLeft className="size-5" aria-hidden="true" /></button>}
              {nextChapter ? <ReaderNavigationLink href={getChapterPath(story.slug, nextChapter.slug)} aria-label="Chương sau" title={nextChapter.tieuDeChuong} className={control}><ChevronRight className="size-5" aria-hidden="true" /></ReaderNavigationLink> : <button type="button" disabled aria-label="Đang ở chương cuối" className={control}><ChevronRight className="size-5" aria-hidden="true" /></button>}
              <div className="flex w-full items-center justify-center border-t border-[var(--reader-border)] md:w-auto md:flex-col">
                <button type="button" aria-label="Lên đầu chương" className={control} onClick={() => scrollTo(false)}><ArrowUp className="size-5" aria-hidden="true" /></button>
                <output ref={percentRef} aria-label="Tiến độ đọc chương" aria-live="off" className="min-w-11 py-1 text-center text-xs font-semibold tabular-nums">0%</output>
                <button type="button" aria-label="Xuống cuối chương" className={control} onClick={() => scrollTo(true)}><ArrowDown className="size-5" aria-hidden="true" /></button>
              </div>
            </>}
          </nav>
          {!collapsed && <button type="button" disabled={!access.canRead} aria-label="Đánh dấu đoạn đang đọc" title="Đánh dấu đoạn đang đọc" className={`${control} ${surface}`} onClick={saveBookmark}><Bookmark className="size-5" aria-hidden="true" /></button>}
        </div>
      </div>
      {panel === "speech" && access.canRead && <ChapterAudioPlayer data={data} onClose={closeSpeech} />}
    </>
  );
}
