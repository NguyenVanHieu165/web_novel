"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Star } from "lucide-react";
import StoryBadge from "./StoryBadge";
import { gsap } from "@/lib/gsap";

export interface StoryCardData {
  idTruyen: number;
  tenTruyen: string;
  slug: string;
  anhBia: string;
  soChuong?: number | null;
  luotXem?: number | null;
  diemDanhGiaTrungBinh?: string | number | null;
  trang_thai?: string | null;
  genres?: string[];
  badge?: "hot" | "moi" | "full" | "dang-ra";
}

interface StoryCardProps {
  story: StoryCardData;
}

const FALLBACK_COVER =
  "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&auto=format&fit=crop&q=60";

export default function StoryCard({ story }: StoryCardProps) {
  const cardRef = useRef<HTMLAnchorElement>(null);
  const hologramRef = useRef<HTMLDivElement>(null);
  const [imageSrc, setImageSrc] = useState(story.anhBia || FALLBACK_COVER);

  const rating = story.diemDanhGiaTrungBinh
    ? parseFloat(story.diemDanhGiaTrungBinh.toString()).toFixed(1)
    : null;

  let badge = story.badge;
  if (!badge) {
    if (story.trang_thai === "hoan_thanh") badge = "full";
    else if (story.trang_thai === "dang_tien_hanh") badge = "dang-ra";
  }

  // 3D Tilt & Hologram Sheen on Hover
  const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;

    gsap.to(cardRef.current, {
      rotateY: x * 14,
      rotateX: -y * 14,
      transformPerspective: 900,
      duration: 0.25,
      ease: "power2.out",
      overwrite: "auto",
    });

    if (hologramRef.current) {
      const sheenX = (x + 0.5) * 100;
      const sheenY = (y + 0.5) * 100;
      gsap.to(hologramRef.current, {
        background: `radial-gradient(circle at ${sheenX}% ${sheenY}%, rgba(255,255,255,0.35) 0%, rgba(96,165,250,0.2) 35%, transparent 70%)`,
        opacity: 0.9,
        duration: 0.2,
        overwrite: "auto",
      });
    }
  };

  const handleMouseLeave = () => {
    if (!cardRef.current) return;
    gsap.to(cardRef.current, {
      rotateX: 0,
      rotateY: 0,
      duration: 0.5,
      ease: "power2.out",
      overwrite: "auto",
    });

    if (hologramRef.current) {
      gsap.to(hologramRef.current, {
        opacity: 0,
        duration: 0.35,
        overwrite: "auto",
      });
    }
  };

  return (
    <Link
      ref={cardRef}
      href={`/truyen/${story.slug}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="story-card-item group relative flex flex-col rounded-2xl overflow-hidden bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 shadow-sm hover:shadow-2xl hover:shadow-blue-500/15 transition-shadow duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      style={{ transformStyle: "preserve-3d" }}
    >
      {/* Hologram Sheen Overlay */}
      <div
        ref={hologramRef}
        className="absolute inset-0 z-30 pointer-events-none rounded-2xl opacity-0 transition-opacity duration-300"
        aria-hidden="true"
      />

      {/* Cover */}
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-slate-100 dark:bg-zinc-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt={story.tenTruyen}
          width={300}
          height={400}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 select-none"
          loading="lazy"
          decoding="async"
          onError={() => setImageSrc(FALLBACK_COVER)}
        />

        {/* Badge with 3D Pop */}
        {badge && (
          <div
            className="absolute top-2.5 right-2.5 z-20"
            style={{ transform: "translateZ(25px)" }}
          >
            <StoryBadge variant={badge} />
          </div>
        )}

        {/* Hover overlay with Read Now button */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-center pb-4 z-20">
          <span className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold rounded-full shadow-lg shadow-blue-600/40 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-200">
            Đọc ngay
          </span>
        </div>
      </div>

      {/* Info */}
      <div
        className="p-3.5 space-y-1.5 flex-1 flex flex-col z-20"
        style={{ transform: "translateZ(20px)" }}
      >
        <h3 className="font-bold text-sm text-slate-800 dark:text-zinc-100 line-clamp-2 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-150">
          {story.tenTruyen}
        </h3>

        {/* Rating */}
        {rating && (
          <div className="flex items-center gap-1">
            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
            <span className="text-xs font-semibold text-yellow-500 dark:text-yellow-400">
              {rating}
            </span>
          </div>
        )}

        {/* Chapter count */}
        {story.soChuong !== undefined && story.soChuong !== null && (
          <div className="flex items-center gap-1 text-slate-400 dark:text-zinc-500">
            <BookOpen className="w-3 h-3" />
            <span className="text-[11px]">
              {story.soChuong.toLocaleString()} chương
            </span>
          </div>
        )}

        {/* Genres */}
        {story.genres && story.genres.length > 0 && (
          <p className="text-[10px] text-slate-400 dark:text-zinc-500 line-clamp-1 mt-auto pt-1">
            {story.genres.slice(0, 2).join(" · ")}
          </p>
        )}
      </div>
    </Link>
  );
}
