"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Trophy, Star, Eye, BookOpen, Flame, ArrowRight } from "lucide-react";
import { StoryCardData } from "@/components/story/StoryCard";
import { gsap, Observer, useGSAP } from "@/lib/gsap";

interface HallOfFameProps {
  stories: StoryCardData[];
}

const RANK_BADGE_COLORS = [
  "from-yellow-400 via-amber-500 to-orange-600 text-white shadow-amber-500/40 border-yellow-300/40",
  "from-slate-300 via-slate-400 to-zinc-500 text-white shadow-slate-400/30 border-slate-200/40",
  "from-amber-600 via-orange-600 to-yellow-800 text-white shadow-orange-700/30 border-amber-400/40",
  "from-blue-600 to-indigo-700 text-white shadow-blue-500/20 border-blue-400/30",
  "from-violet-600 to-purple-700 text-white shadow-purple-500/20 border-violet-400/30",
];

export default function HallOfFame({ stories }: HallOfFameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Lưu trữ độ cuộn nội bộ
  const scrollOffsetRef = useRef(0);
  const maxScrollRef = useRef(0);
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  const topStories = stories.slice(0, 10);

  useGSAP(
    () => {
      if (!containerRef.current || !trackRef.current || topStories.length === 0)
        return;

      const track = trackRef.current;
      const container = containerRef.current;

      // Tính tổng khoảng cách tối đa cần trượt ngang
      const calculateBounds = () => {
        if (!track || !container) return;
        const totalTrackWidth = track.scrollWidth;
        const visibleWidth = container.clientWidth;
        maxScrollRef.current = Math.max(0, totalTrackWidth - visibleWidth + 32);
      };

      calculateBounds();
      window.addEventListener("resize", calculateBounds);

      // Cập nhật vị trí trượt mượt mà
      const applyScroll = (target: number) => {
        if (tweenRef.current) tweenRef.current.kill();

        tweenRef.current = gsap.to(track, {
          x: -target,
          duration: 0.5,
          ease: "power2.out",
          overwrite: "auto",
        });

        // Parallax số rank watermark chìm phía sau
        gsap.to(".parallax-rank-num", {
          x: target * 0.28,
          duration: 0.5,
          ease: "power2.out",
          overwrite: "auto",
        });
      };

      // Chỉ lắng nghe sự kiện lăn chuột/vuốt khi con trỏ ở trong containerRef
      const observer = Observer.create({
        target: container,
        type: "wheel,touch",
        preventDefault: true, // Khóa cuộn dọc của trang khi đang trỏ vào track
        wheelSpeed: -1,
        onChange: (self) => {
          const delta = (self.deltaY || self.deltaX) * 1.6;
          const nextOffset = gsap.utils.clamp(
            0,
            maxScrollRef.current,
            scrollOffsetRef.current + delta,
          );

          if (nextOffset !== scrollOffsetRef.current) {
            scrollOffsetRef.current = nextOffset;
            applyScroll(scrollOffsetRef.current);
          }
        },
      });

      return () => {
        observer.kill();
        window.removeEventListener("resize", calculateBounds);
      };
    },
    { dependencies: [topStories.length], scope: containerRef },
  );

  return (
    <section className="relative w-full py-6 select-none">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4 px-2">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-amber-500 dark:text-amber-400 mb-1">
            <Trophy className="w-4 h-4" />
            <span>Đấu Trường Phong Thần</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Bảng Xếp Hạng
          </h2>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-xs text-slate-400 max-w-xs leading-relaxed hidden lg:block">
            {isHovered
              ? "Đang cuộn ngang danh sách..."
              : "Rê chuột vào danh sách để lướt ngang qua các siêu phẩm."}
          </p>
          <Link
            href="/xep-hang"
            className="inline-flex items-center gap-1 text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors"
          >
            Xem đầy đủ
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </div>

      {/* Vùng bắt sự kiện trỏ chuột: Hover vào đây mới chặn cuộn dọc để cuộn ngang */}
      <div
        ref={containerRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative w-full overflow-hidden py-2"
      >
        {/* Horizontal Track Container */}
        <div
          ref={trackRef}
          className="flex items-stretch gap-6 will-change-transform pb-6 pl-2"
          style={{ width: "max-content" }}
        >
          {topStories.map((story, index) => {
            const rankNum = index + 1;
            const isTop3 = index < 3;
            const badgeGradient =
              RANK_BADGE_COLORS[index] ||
              "from-slate-700 to-slate-900 text-slate-300 border-slate-700";

            return (
              <div
                key={story.idTruyen}
                className="relative w-[300px] sm:w-[340px] shrink-0 rounded-3xl p-5 bg-white dark:bg-zinc-900/90 border border-slate-200/80 dark:border-zinc-800 shadow-lg hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-300 flex flex-col justify-between group overflow-hidden"
              >
                {/* Giant Parallax Background Ranking Number */}
                <span
                  className="parallax-rank-num absolute -right-4 -bottom-6 text-[130px] sm:text-[160px] font-black leading-none select-none pointer-events-none opacity-[0.06] dark:opacity-[0.08] text-slate-900 dark:text-white"
                  aria-hidden="true"
                >
                  #{rankNum}
                </span>

                {/* Card Top: Rank Badge & Reads */}
                <div className="flex items-center justify-between z-10 mb-4">
                  <div
                    className={`w-9 h-9 rounded-2xl bg-gradient-to-br ${badgeGradient} border flex items-center justify-center font-black text-sm shadow-md`}
                  >
                    {rankNum}
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-zinc-800/80 text-[11px] font-semibold text-slate-600 dark:text-zinc-300 border border-slate-200/50 dark:border-zinc-700/50">
                    <Eye className="w-3 h-3 text-blue-500" />
                    <span>{(story.luotXem || 0).toLocaleString("vi-VN")}</span>
                  </div>
                </div>

                {/* Middle: Cover + Story Info */}
                <div className="flex gap-4 z-10 mb-4">
                  <Link
                    href={`/truyen/${story.slug}`}
                    prefetch={false}
                    className="w-24 sm:w-28 aspect-[2/3] rounded-2xl overflow-hidden shrink-0 bg-slate-800 shadow-md group-hover:scale-105 transition-transform duration-300"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={story.anhBia}
                      alt={story.tenTruyen}
                      width={112}
                      height={168}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </Link>

                  <div className="flex flex-col justify-between min-w-0 flex-1">
                    <div>
                      {story.genres && story.genres.length > 0 && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 dark:text-blue-400">
                          {story.genres[0]}
                        </span>
                      )}
                      <Link href={`/truyen/${story.slug}`} prefetch={false}>
                        <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-zinc-100 line-clamp-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors leading-snug mt-0.5">
                          {story.tenTruyen}
                        </h3>
                      </Link>
                    </div>

                    <div className="space-y-1 mt-2">
                      <div className="flex items-center gap-1 text-xs text-yellow-500 font-bold">
                        <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                        <span>{story.diemDanhGiaTrungBinh || "5.0"}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <BookOpen className="w-3 h-3" />
                        <span>
                          {(story.soChuong || 0).toLocaleString("vi-VN")} chương
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Button */}
                <div className="pt-3 border-t border-slate-100 dark:border-zinc-800/80 z-10 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                    {isTop3 ? (
                      <span className="text-orange-500 flex items-center gap-0.5">
                        <Flame className="w-3.5 h-3.5" /> Top đầu
                      </span>
                    ) : (
                      "Thịnh hành"
                    )}
                  </span>
                  <Link
                    href={`/truyen/${story.slug}`}
                    prefetch={false}
                    className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors group-hover:translate-x-0.5"
                  >
                    <span>Khám phá</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
