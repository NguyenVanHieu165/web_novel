"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ArrowRight, X, Sparkles } from "lucide-react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { useAuth } from "@/context/AuthContext";
import { readingHistoryResponseSchema } from "@/lib/reading-progress";

interface ReadingStoryItem {
  idTruyen: number;
  tenTruyen: string;
  slug: string;
  anhBia: string;
  chapterName: string;
  chapterSlug: string;
  progress: number;
}

interface ReadingDockProps {
  story?: ReadingStoryItem | null;
}

export default function ReadingDock({ story }: ReadingDockProps) {
  const { user } = useAuth();
  const pathname = usePathname();
  // The chapter reader has its own navigation; do not obstruct it with a floating dock.
  if (pathname.startsWith("/truyen/")) return null;
  if (story) return <ReadingDockContent story={story} />;
  if (!user) return null;
  return <PersonalReadingDock key={`${pathname}:${user.idTaiKhoan}`} />;
}

function PersonalReadingDock() {
  const [story, setStory] = useState<ReadingStoryItem | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/reading-history?limit=1", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const result = readingHistoryResponseSchema.safeParse(await response.json());
        const entry = result.success ? result.data.data[0] : null;
        if (entry && !controller.signal.aborted) setStory({
          idTruyen: entry.chapterId, tenTruyen: entry.storyTitle, slug: entry.storySlug,
          anhBia: entry.storyCover, chapterName: entry.chapterTitle, chapterSlug: entry.chapterSlug, progress: entry.percent,
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.error("Không thể tải thanh đọc tiếp", error);
      });
    return () => controller.abort();
  }, []);
  return story ? <ReadingDockContent story={story} /> : null;
}

function ReadingDockContent({ story: activeStory }: { story: ReadingStoryItem }) {
  const [closed, setClosed] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);

  useGSAP(
    (_context, contextSafe) => {
      if (!dockRef.current || !contextSafe) return;

      // Initially hidden below the viewport
      gsap.set(dockRef.current, { y: 100, autoAlpha: 0 });
      const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 0.3;

      // Trigger floating dock when window scrolls past 500px
      // Dùng document.documentElement làm trigger trực tiếp hoặc bỏ trigger string
      const st = ScrollTrigger.create({
        trigger: document.documentElement,
        start: "500px top",
        onEnter: contextSafe(() => {
          if (!closed) {
            gsap.to(dockRef.current, {
              y: 0,
              autoAlpha: 1,
              duration,
              ease: "back.out(1.4)",
              overwrite: "auto",
            });
          }
        }),
        onLeaveBack: contextSafe(() => {
          gsap.to(dockRef.current, {
            y: 100,
            autoAlpha: 0,
            duration,
            ease: "power2.in",
            overwrite: "auto",
          });
        }),
      });

      return () => st.kill();
    },
    { dependencies: [closed], scope: dockRef, revertOnUpdate: true },
  );

  if (closed) return null;

  return (
    <aside
      ref={dockRef}
      className="fixed bottom-6 inset-x-0 z-50 flex justify-center px-4 pointer-events-none"
    >
      <div className="pointer-events-auto flex items-center gap-3.5 bg-slate-900/90 dark:bg-zinc-900/95 backdrop-blur-xl border border-white/15 px-4 py-2.5 rounded-full shadow-2xl shadow-black/40 hover:scale-[1.02] transition-transform duration-200">
        {/* Thumbnail */}
        <div className="relative w-9 h-12 rounded-lg overflow-hidden shrink-0 bg-slate-800 border border-white/10 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeStory.anhBia}
            width={36}
            height={48}
            loading="lazy"
            decoding="async"
            alt={activeStory.tenTruyen}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Info */}
        <div className="flex flex-col min-w-0 max-w-[180px] sm:max-w-[260px] md:max-w-[320px]">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-400">
            <Sparkles
              className="w-3 h-3"
            />
            <span>Tiếp tục đọc</span>
          </div>
          <Link
            href={`/truyen/${activeStory.slug}`}
            className="font-bold text-xs sm:text-sm text-white truncate hover:text-blue-400 transition-colors"
          >
            {activeStory.tenTruyen}
          </Link>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-slate-400 truncate flex items-center gap-1">
              <BookOpen className="w-2.5 h-2.5" />
              {activeStory.chapterName}
            </span>
            <span className="text-[10px] font-semibold text-blue-300">
              {Math.round(activeStory.progress)}%
            </span>
          </div>
        </div>

        {/* Read Button */}
        <Link
          href={`/truyen/${activeStory.slug}/${activeStory.chapterSlug}`}
          className="ml-2 flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold rounded-full shadow-md shadow-blue-500/25 transition-all shrink-0"
        >
          <span>Đọc tiếp</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>

        {/* Close Button */}
        <button
          type="button"
          onClick={() => setClosed(true)}
          aria-label="Đóng thanh đọc truyện"
          className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}
