"use client";

import { useState, useRef, useEffect } from "react";
import SectionHeader from "@/components/common/SectionHeader";
import StoryCard from "@/components/story/StoryCard";
import { gsap, useGSAP } from "@/lib/gsap";
import { Button } from "@/components/ui/button";
import { getHomeTabStories, type HomeStoryCollections } from "@/lib/home-discovery";
import { Flame, Sparkles, Star, CheckCircle2, Layers } from "lucide-react";

interface NewStoriesProps {
  collections: HomeStoryCollections;
}

const TABS = [
  { id: "all", label: "Đề xuất", icon: Layers },
  { id: "trending", label: "Thịnh hành", icon: Flame },
  { id: "newest", label: "Mới nhất", icon: Sparkles },
  { id: "top-rated", label: "Đánh giá cao", icon: Star },
  { id: "completed", label: "Hoàn thành", icon: CheckCircle2 },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function NewStories({ collections }: NewStoriesProps) {
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [isShuffling, setIsShuffling] = useState(false);

  const sectionRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const unlockTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialEntranceDoneRef = useRef(false);

  const displayStories = getHomeTabStories(collections, activeTab);
  const catalogHref = activeTab === "completed" ? "/truyen-full"
    : activeTab === "newest" ? "/truyen-moi"
    : activeTab === "top-rated" ? "/tim-kiem?sapXep=danhGia"
    : activeTab === "trending" ? "/tim-kiem?sapXep=luotXem" : "/tim-kiem";

  useEffect(() => {
    return () => {
      if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    };
  }, []);

  /**
   * =========================================================
   * INITIAL ENTRANCE: BẮN TOẢ TỪ TÂM KHI CUỘN TỚI LẦN ĐẦU
   * =========================================================
   */
  const { contextSafe } = useGSAP(
    () => {
      if (isInitialEntranceDoneRef.current) return;

      const cards = gsap.utils.toArray<HTMLElement>(".new-story-flip-card");
      const grid = gridRef.current;
      if (!cards.length || !grid) return;

      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: reduce)", () => {
        const visibleCards = gridRef.current?.querySelectorAll<HTMLElement>(".new-story-flip-card");
        if (visibleCards?.length) gsap.set(visibleCards, { clearProps: "transform,opacity" });
        isInitialEntranceDoneRef.current = true;
      });
      media.add("(prefers-reduced-motion: no-preference)", () => {
        if (isInitialEntranceDoneRef.current) return;
        const gridRect = grid.getBoundingClientRect();
        const centerX = gridRect.left + gridRect.width / 2;
        const centerY = gridRect.top + gridRect.height / 2;

        // Measure the whole grid before writing any transform.
        const cardRects = cards.map((card) => card.getBoundingClientRect());
        cards.forEach((card, index) => {
          const rect = cardRects[index];
          const cardCenterX = rect.left + rect.width / 2;
          const cardCenterY = rect.top + rect.height / 2;

          gsap.set(card, {
            x: (centerX - cardCenterX) * 0.85,
            y: (centerY - cardCenterY) * 0.85,
            rotation: gsap.utils.random(-15, 15),
            scale: 0.3,
            opacity: 0,
          });
        });

        gsap.to(cards, {
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 75%",
            once: true,
          },
          x: 0,
          y: 0,
          rotation: 0,
          scale: 1,
          opacity: 1,
          duration: 0.75,
          ease: "back.out(1.5)",
          stagger: { amount: 0.35, from: "center", grid: "auto" },
          clearProps: "transform,opacity",
          onComplete: () => {
            isInitialEntranceDoneRef.current = true;
          },
        });
      });
      return () => media.revert();
    },
    { scope: sectionRef },
  );

  /**
   * =========================================================
   * PHASE 1: GỘP TẤT CẢ CARD VỀ TÂM KHI BẤM TAB
   * =========================================================
   */
  const handleTabChange = (tabId: TabId) => contextSafe(() => {
    if (tabId === activeTab || isShuffling) return;

    const grid = gridRef.current;
    const cards = grid ? Array.from(grid.querySelectorAll<HTMLElement>(".new-story-flip-card")) : [];

    if (!cards.length || !grid || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setActiveTab(tabId);
      return;
    }

    // A tab can be chosen before its scroll entrance finishes; settle that entrance first.
    if (!isInitialEntranceDoneRef.current) {
      gsap.killTweensOf(cards);
      gsap.set(cards, { clearProps: "transform,opacity" });
      isInitialEntranceDoneRef.current = true;
    }

    setIsShuffling(true);

    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    unlockTimerRef.current = setTimeout(() => {
      setIsShuffling(false);
    }, 900);

    const gridRect = grid.getBoundingClientRect();
    const centerX = gridRect.left + gridRect.width / 2;
    const centerY = gridRect.top + gridRect.height / 2;
    const cardRects = cards.map((card) => card.getBoundingClientRect());

    const tl = gsap.timeline({
      onComplete: () => {
        setActiveTab(tabId);
      },
    });

    cards.forEach((card, index) => {
      const rect = cardRects[index];
      const cardCenterX = rect.left + rect.width / 2;
      const cardCenterY = rect.top + rect.height / 2;

      const deltaX = centerX - cardCenterX;
      const deltaY = centerY - cardCenterY;
      const rotation = (index % 2 === 0 ? 1 : -1) * (6 + (index % 4) * 2);

      tl.to(
        card,
        {
          x: deltaX,
          y: deltaY,
          rotation,
          scale: 0.72,
          opacity: 0.8,
          duration: 0.32,
          ease: "power3.inOut",
        },
        0,
      );
    });
  })();

  /**
   * =========================================================
   * PHASE 2: BẮN TOẢ TỪ TÂM KHI ĐỔI XONG TAB
   * =========================================================
   */
  useGSAP(
    () => {
      // Chỉ chạy khi đã qua lần cuộn đầu tiên (Initial Entrance)
      if (!isInitialEntranceDoneRef.current) return;

      const grid = gridRef.current;
      if (!grid) {
        setIsShuffling(false);
        return;
      }

      const cards = Array.from(grid.querySelectorAll<HTMLElement>(".new-story-flip-card"));
      if (!cards.length) {
        setIsShuffling(false);
        return;
      }

      gsap.set(cards, { clearProps: "x,y,rotation,scale,opacity" });
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
        setIsShuffling(false);
        return;
      }

      const gridRect = grid.getBoundingClientRect();
      const centerX = gridRect.left + gridRect.width / 2;
      const centerY = gridRect.top + gridRect.height / 2;
      const cardRects = cards.map((card) => card.getBoundingClientRect());

      const tl = gsap.timeline({
        onComplete: () => {
          if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
          setIsShuffling(false);
        },
      });

      cards.forEach((card, index) => {
        const rect = cardRects[index];
        const cardCenterX = rect.left + rect.width / 2;
        const cardCenterY = rect.top + rect.height / 2;

        const startX = centerX - cardCenterX;
        const startY = centerY - cardCenterY;
        const startRotation = gsap.utils.random(-12, 12);

        gsap.set(card, {
          x: startX,
          y: startY,
          scale: 0.35,
          rotation: startRotation,
          opacity: 0,
        });

        tl.to(
          card,
          {
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
            opacity: 1,
            duration: 0.55,
            ease: "back.out(1.4)",
            clearProps: "transform,opacity",
          },
          index * 0.03,
        );
      });
    },
    {
      dependencies: [activeTab],
      scope: sectionRef,
      revertOnUpdate: true,
    },
  );

  return (
    <section ref={sectionRef} className="space-y-6 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <SectionHeader title="Truyện Mới & Thịnh Hành" href={catalogHref} />
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none" aria-label="Nhóm truyện gợi ý">
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          const Icon = tab.icon;

          return (
            <Button
              key={tab.id}
              type="button"
              size="sm"
              variant={isActive ? "default" : "outline"}
              onClick={() => handleTabChange(tab.id)}
              disabled={isShuffling}
              aria-pressed={isActive}
              className={isActive ? "scale-105 rounded-full px-4 font-bold shadow-md" : "rounded-full px-4 font-bold"}
            >
              <Icon
                aria-hidden="true"
                className={isActive ? "text-primary-foreground" : "text-primary"}
              />
              {tab.label}
            </Button>
          );
        })}
      </div>

      <p className="text-sm text-slate-500 dark:text-zinc-400" aria-live="polite">
        {displayStories.length} gợi ý được chọn từ kho truyện. Chọn “Xem tất cả” để khám phá thêm.
      </p>
      {/* Grid: Tái tạo DOM sạch sẽ qua activeTab */}
      {displayStories.length > 0 ? (
        <div
          key={activeTab}
          ref={gridRef}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 min-h-[440px]"
        >
          {displayStories.map((story) => (
            <div
              key={`${activeTab}-${story.idTruyen}`}
              className="new-story-flip-card"
            >
              <StoryCard story={story} />
            </div>
          ))}
        </div>
      ) : (
        <div className="py-16 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800">
          <p className="text-sm text-slate-400 italic">
            {activeTab === "completed" ? "Chưa có truyện hoàn thành." : "Chưa có truyện nào trong danh mục này."}
          </p>
        </div>
      )}
    </section>
  );
}
