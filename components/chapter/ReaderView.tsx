"use client";

import { useState, useRef } from "react";
import { ChevronLeft, List } from "lucide-react";
import { getChapterPath, getStoryPath } from "@/lib/reader-navigation";
import type { ChapterDetailData } from "@/lib/mappers/chapter.mapper";
import { ChapterText } from "./ChapterText";
import ChapterDrawer from "./ChapterDrawer";
import ReadingProgress from "./ReadingProgress";
import ChapterUnlockCard from "./ChapterUnlockCard";
import ReaderSettingsPanel from "./ReaderSettingsPanel";
import ChapterNavigation from "./ChapterNavigation";
import ReadingDock from "./ReadingDock";
import ReaderNavigationProvider, { ReaderNavigationLink } from "./ReaderNavigationProvider";
import { useReaderPreferences } from "./ReaderAppearance";
import { useReaderTypographyAnchor } from "@/hooks/useReaderTypographyAnchor";

interface ReaderViewProps {
  data: ChapterDetailData;
}

export default function ReaderView({ data }: ReaderViewProps) {
  const { story, chapter, prevChapter, nextChapter, access } = data;
  const { settings, updateSettings } = useReaderPreferences();
  const onSettingsChange = useReaderTypographyAnchor(settings, updateSettings);
  const [panel, setPanel] = useState<"contents" | "settings" | "speech" | null>(null);
  const showSettings = panel === "settings";
  const showDrawer = panel === "contents";
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <ReaderNavigationProvider key={chapter.idChuong} chapterId={chapter.idChuong}>
      <div className="min-h-screen">
        <nav aria-label="Đường dẫn chương" className="mx-auto flex max-w-[var(--reader-width)] items-center gap-2 px-5 py-4 text-xs opacity-80 sm:px-8 md:pr-24 xl:pr-8">
          <ReaderNavigationLink href={getStoryPath(story.slug)} className="flex min-w-0 items-center gap-1 rounded hover:underline focus-visible:outline-2">
            <ChevronLeft className="size-4 shrink-0" aria-hidden="true" /><span className="truncate">{story.tenTruyen}</span>
          </ReaderNavigationLink>
          <span aria-hidden="true">/</span><span className="shrink-0" aria-current="page">Chương {chapter.chuongSo}</span>
        </nav>
        <main id="reader-main" tabIndex={-1} className="px-3 pb-36 pt-2 outline-none scroll-mt-28 sm:px-6 md:pr-24 xl:px-24">
          <ReadingDock data={data} panel={panel} onPanelChange={setPanel} drawerTriggerRef={drawerTriggerRef} settingsTriggerRef={settingsTriggerRef} />
          <div className="mx-auto max-w-[var(--reader-width)] rounded-xl border border-[var(--reader-border)] bg-[var(--reader-paper)] px-5 py-8 shadow-[0_8px_40px_-12px_rgb(0_0_0/.14)] sm:px-10 sm:py-12">
          {access.canRead && <ReadingProgress key={chapter.idChuong} chapterId={chapter.idChuong} />}
          <div className="mb-10 space-y-2 border-b border-[var(--reader-border)] pb-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest opacity-60">{story.tenTruyen}</p>
            <h1 className="text-xl font-black leading-snug sm:text-2xl md:text-3xl">{chapter.tieuDeChuong}</h1>
          </div>
          {!access.canRead ? (
            <ChapterUnlockCard
              key={chapter.idChuong}
              chapter={chapter}
              access={access}
              returnPath={getChapterPath(story.slug, chapter.slug)}
            />
          ) : (
            <article
              id="reader-content"
              className="space-y-6 [&>p]:scroll-mt-28 [&>p[data-speaking=true]]:rounded-md [&>p[data-speaking=true]]:bg-[var(--reader-surface)] [&>p[data-speaking=true]]:outline-2 [&>p[data-speaking=true]]:outline-[var(--reader-accent)]"
              style={{
                fontSize: "var(--reader-font-size)",
                fontFamily: "var(--reader-font-family)",
                lineHeight: "var(--reader-line-height)",
              }}
            >
              <ChapterText content={chapter.noiDung} />
            </article>
          )}

          <div id="reader-end" className="scroll-mt-28" />
          <ChapterNavigation
            storySlug={story.slug}
            prevChapter={prevChapter}
            nextChapter={nextChapter}
            disableShortcut={panel !== null}
          >
            <button
              type="button"
              onClick={(event) => {
                drawerTriggerRef.current = event.currentTarget;
                setPanel("contents");
              }}
              aria-expanded={showDrawer}
              aria-haspopup="dialog"
              className="flex items-center gap-1 rounded-xl px-3 py-2.5 text-xs font-bold transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            >
              <List className="h-4 w-4" aria-hidden="true" />
              <span>Mục lục</span>
            </button>
          </ChapterNavigation>
          </div>
        </main>

        <ReaderSettingsPanel
          open={showSettings}
          onOpenChange={(open) => setPanel(open ? "settings" : null)}
          triggerRef={settingsTriggerRef}
          settings={settings}
          onSettingsChange={onSettingsChange}
        />
        <ChapterDrawer
          key={chapter.idChuong}
          open={showDrawer}
          onOpenChange={(open) => setPanel(open ? "contents" : null)}
          storySlug={story.slug}
          storyTitle={story.tenTruyen}
          chapterId={chapter.idChuong}
          triggerRef={drawerTriggerRef}
        />
      </div>
    </ReaderNavigationProvider>
  );
}
