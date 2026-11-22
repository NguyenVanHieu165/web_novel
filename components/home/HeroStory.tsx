"use client";

import { useState } from "react";
import HeroCarousel from "./story/HeroCarousel";
import type { HeroStoryData } from "./story/HeroStoryCard";

interface HeroStoryProps {
  story: HeroStoryData | null;
  stories?: HeroStoryData[];
}

export default function HeroStory({ story, stories }: HeroStoryProps) {
  const carouselStories =
    stories && stories.length > 0 ? stories : story ? [story] : [];

  return carouselStories.length > 0 ? <HeroStoryCarousel stories={carouselStories} /> : null;
}

function HeroStoryCarousel({ stories }: { stories: HeroStoryData[] }) {
  const [activeStoryId, setActiveStoryId] = useState(stories[0].idTruyen);
  const activeStory = stories.find((story) => story.idTruyen === activeStoryId) ?? stories[0];

  return (
    <section className="relative w-full overflow-visible py-4 sm:py-6">
      {/* 
        1. AMBIENT GLOW TỰ ĐỘNG ĐỔI MÀU THEO TRUYỆN:
        Chỉ là một quầng sáng mềm mại tỏa ra ở trung tâm, không làm đen cả màn hình
      */}
      {activeStory?.anhBia && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center -z-10 overflow-hidden">
          <div
            className="h-[430px] w-[290px] sm:h-[480px] sm:w-[330px] md:h-[510px] md:w-[350px] rounded-3xl opacity-35 blur-[90px] sm:blur-[130px] transition-all duration-1000 ease-out scale-110"
            style={{
              backgroundImage: `url(${activeStory.anhBia})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              borderRadius: "1.5rem",
            }}
          />
        </div>
      )}

      {/* 
        2. QUẦNG SÁNG PHỤ (Radial Blur nhẹ nhàng)
      */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(59, 130, 246, 0.08) 0%, transparent 70%)",
        }}
      />

      {/* 
        3. CAROUSEL CARD TỰ DO BAY NỔI TRÊN NỀN WEB
      */}
      <div className="relative z-10 w-full">
        <HeroCarousel
          stories={stories}
          onActiveStoryChange={(s: HeroStoryData) => setActiveStoryId(s.idTruyen)}
        />
      </div>
    </section>
  );
}
