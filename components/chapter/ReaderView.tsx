"use client";

import { memo, useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { ReaderPanelSkeleton } from "@/components/common/InteractionSkeleton";
import { ChevronLeft, List } from "lucide-react";
import { getChapterPath, getStoryPath } from "@/lib/reader-navigation";
import type { ChapterDetailData } from "@/lib/mappers/chapter.mapper";
import { ChapterText } from "./ChapterText";
import ReadingProgress from "./ReadingProgress";
import ChapterUnlockCard from "./ChapterUnlockCard";
import ChapterNavigation from "./ChapterNavigation";
import ReadingDock from "./ReadingDock";
import ReaderNavigationProvider, { ReaderNavigationLink } from "./ReaderNavigationProvider";
import { useReaderPreferences } from "./ReaderAppearance";
import { useReaderTypographyAnchor } from "@/hooks/useReaderTypographyAnchor";
import { Button } from "@/components/ui/button";

interface ReaderViewProps {
  data: ChapterDetailData;
}

const ChapterDrawer = dynamic(() => import("./ChapterDrawer"), { ssr: false, loading: ReaderPanelSkeleton });
const ReaderSettingsPanel = dynamic(() => import("./ReaderSettingsPanel"), { ssr: false, loading: ReaderPanelSkeleton });
type ReaderPanel = "contents" | "settings" | "speech" | null;

// Reader typography is applied through inherited CSS variables. Keeping this
// subtree memoized prevents rebuilding the chapter text when settings change.
const ReaderChapterContent = memo(function ReaderChapterContent({ content }: { content: string }) {
  return (
    <article
      id="reader-content"
      className="space-y-6 [&>p]:scroll-mt-28 [&>p[data-speaking=true]]:rounded-md [&>p[data-speaking=true]]:bg-[var(--reader-surface)] [&>p[data-speaking=true]]:outline-2 [&>p[data-speaking=true]]:outline-[var(--reader-accent)]"
      style={{
        color: "var(--reader-content-text)",
        fontSize: "var(--reader-font-size)",
        fontFamily: "var(--reader-font-family)",
        lineHeight: "var(--reader-line-height)",
      }}
    >
      <ChapterText content={content} />
    </article>
  );
});

export default function ReaderView({ data }: ReaderViewProps) {
  const { story, chapter, prevChapter, nextChapter, access } = data;
  const { settings, updateSettings } = useReaderPreferences();
  const onSettingsChange = useReaderTypographyAnchor(settings, updateSettings);
  const [panel, setPanel] = useState<ReaderPanel>(null);
  const [loadedPanels, setLoadedPanels] = useState({ contents: false, settings: false });
  const onPanelChange = useCallback((nextPanel: ReaderPanel) => {
    if (nextPanel === "contents" || nextPanel === "settings") {
      setLoadedPanels((loaded) => loaded[nextPanel] ? loaded : { ...loaded, [nextPanel]: true });
    }
    setPanel(nextPanel);
  }, []);
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
          <ReadingDock data={data} panel={panel} onPanelChange={onPanelChange} drawerTriggerRef={drawerTriggerRef} settingsTriggerRef={settingsTriggerRef} />
          <div className="mx-auto max-w-[var(--reader-width)] rounded-xl border border-[var(--reader-border)] bg-[var(--reader-paper)] px-5 py-8 shadow-[0_8px_40px_-12px_rgb(0_0_0/.14)] sm:px-10 sm:py-12">
          {access.canRead && (
            <ReadingProgress
              key={chapter.idChuong}
              chapterId={chapter.idChuong}
              storySlug={story.slug}
              chapterNumber={chapter.chuongSo}
              chapterSlug={chapter.slug}
              chapterTitle={chapter.tieuDeChuong}
            />
          )}
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
          ) : <ReaderChapterContent content={chapter.noiDung} />}

          <div id="reader-end" className="scroll-mt-28" />
          <ChapterNavigation
            storySlug={story.slug}
            prevChapter={prevChapter}
            nextChapter={nextChapter}
            disableShortcut={panel !== null}
          >
            <Button
              type="button"
              variant="ghost"
              onClick={(event) => {
                drawerTriggerRef.current = event.currentTarget;
                onPanelChange("contents");
              }}
              aria-expanded={showDrawer}
              aria-haspopup="dialog"
              className="rounded-xl text-xs font-bold text-[var(--reader-text)] hover:bg-[var(--reader-surface)] focus-visible:border-[var(--reader-accent)] focus-visible:ring-[var(--reader-accent)]/40"
            >
              <List className="h-4 w-4" aria-hidden="true" />
              <span>Mục lục</span>
            </Button>
          </ChapterNavigation>
          </div>
        </main>

        {loadedPanels.settings && <ReaderSettingsPanel
          open={showSettings}
          onOpenChange={(open) => onPanelChange(open ? "settings" : null)}
          triggerRef={settingsTriggerRef}
          settings={settings}
          onSettingsChange={onSettingsChange}
        />}
        {loadedPanels.contents && <ChapterDrawer
          key={chapter.idChuong}
          open={showDrawer}
          onOpenChange={(open) => onPanelChange(open ? "contents" : null)}
          storySlug={story.slug}
          storyTitle={story.tenTruyen}
          chapterId={chapter.idChuong}
          triggerRef={drawerTriggerRef}
        />}
      </div>
    </ReaderNavigationProvider>
  );
}
