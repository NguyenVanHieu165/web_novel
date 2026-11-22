"use client";

import { useRef } from "react";
import SectionHeader from "@/components/common/SectionHeader";
import StoryCard, { StoryCardData } from "@/components/story/StoryCard";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/lib/gsap";

interface CompletedStoriesProps {
  stories: StoryCardData[];
}

export default function CompletedStories({ stories }: CompletedStoriesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const storiesWithBadge = stories.map((s) => ({ ...s, badge: "full" as const }));

  useGSAP(
    () => {
      const cards = gsap.utils.toArray<HTMLElement>(".completed-card-item");
      if (cards.length === 0) return;

      gsap.from(cards, {
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 85%",
          toggleActions: "play none none none",
        },
        opacity: 0,
        y: 40,
        scale: 0.95,
        stagger: 0.08,
        duration: 0.6,
        ease: "power3.out",
      });
    },
    { scope: containerRef, dependencies: [stories] }
  );

  return (
    <section ref={containerRef} className="relative">
      <SectionHeader title="Truyện đã hoàn thành" href="/truyen-full" />
      
      {stories.length === 0 ? (
        <div className="py-16 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800">
          <p className="text-sm text-slate-400 italic">Chưa có truyện nào.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {storiesWithBadge.map((story) => (
            <div key={story.idTruyen} className="completed-card-item will-change-transform">
              <StoryCard story={story} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

