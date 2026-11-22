"use client";

import { useRef } from "react";
import Link from "next/link";
import { Sparkles, Star, BookOpen, Flame, ArrowRight, ShieldCheck } from "lucide-react";
import { StoryCardData } from "@/components/story/StoryCard";
import { gsap, useGSAP } from "@/lib/gsap";

interface UniverseShowcaseProps {
  story?: StoryCardData | null;
}

export default function UniverseShowcase({ story }: UniverseShowcaseProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bgLayerRef = useRef<HTMLDivElement>(null);
  const characterLayerRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);

  const fallbackStory: StoryCardData = {
    idTruyen: 999,
    tenTruyen: "Vạn Cổ Đệ Nhất Thần",
    slug: "van-co-de-nhat-than",
    anhBia:
      story?.anhBia ||
      "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=800&auto=format&fit=crop&q=80",
    soChuong: 1850,
    luotXem: 1450200,
    diemDanhGiaTrungBinh: "4.9",
    genres: ["Tiên Hiệp", "Huyền Huyễn", "Trọng Sinh"],
  };

  const showcaseStory = story || fallbackStory;

  useGSAP(
    () => {
      if (!containerRef.current) return;

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 85%",
          end: "bottom 15%",
          scrub: 1.2,
        },
      });

      // Parallax Layer 1: Background
      if (bgLayerRef.current) {
        tl.to(bgLayerRef.current, { yPercent: -15, ease: "none" }, 0);
      }

      // Parallax Layer 2: Character/Book cutout
      if (characterLayerRef.current) {
        tl.to(characterLayerRef.current, { yPercent: -26, scale: 1.06, ease: "none" }, 0);
      }

      // Parallax Layer 3: Floating Title and text
      if (textLayerRef.current) {
        tl.to(textLayerRef.current, { yPercent: -35, ease: "none" }, 0);
      }
    },
    { scope: containerRef }
  );

  return (
    <section
      ref={containerRef}
      className="relative w-full min-h-[460px] lg:min-h-[520px] rounded-3xl overflow-hidden bg-slate-950 border border-blue-500/20 shadow-2xl shadow-blue-950/40 my-8 flex items-center"
    >
      {/* ── Layer 1: Background Cosmos Parallax ── */}
      <div
        ref={bgLayerRef}
        className="absolute -inset-10 bg-cover bg-center will-change-transform opacity-35"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=1600&auto=format&fit=crop&q=80')",
        }}
      />
      {/* Dark & Cyan Gradients */}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-blue-950/30" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-600/20 via-transparent to-transparent" />

      {/* ── Content Container ── */}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-6 sm:px-10 lg:px-14 py-12 grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr] gap-10 items-center">
        {/* ── Layer 3: Floating Text & Badges ── */}
        <div ref={textLayerRef} className="space-y-4 will-change-transform">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-bold uppercase tracking-widest backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Siêu Phẩm Đỉnh Cao Tuần Này</span>
          </div>

          {/* Genres */}
          <div className="flex flex-wrap gap-2">
            {showcaseStory.genres?.map((g) => (
              <span
                key={g}
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-slate-300 backdrop-blur-md"
              >
                {g}
              </span>
            ))}
          </div>

          {/* Title */}
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white leading-tight tracking-tight drop-shadow-lg">
            {showcaseStory.tenTruyen}
          </h2>

          {/* Description */}
          <p className="text-sm text-slate-300 leading-relaxed max-w-lg line-clamp-3">
            Tác phẩm tiên hiệp huyền huyễn với bối cảnh hùng tráng, vũ trụ bao la, nhân vật lập chí kiên cường và những trận đại chiến kinh thiên động địa. Được độc giả bình chọn là bộ truyện xuất sắc nhất tháng.
          </p>

          {/* Key Stats */}
          <div className="flex items-center gap-6 py-2 text-sm text-slate-300">
            <span className="flex items-center gap-1.5">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
              <span className="font-bold text-white text-base">
                {showcaseStory.diemDanhGiaTrungBinh || "4.9"}
              </span>
              <span className="text-slate-400 text-xs">/ 5.0</span>
            </span>

            <span className="flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-blue-400" />
              <span className="font-semibold text-white">
                {(showcaseStory.soChuong || 0).toLocaleString()}
              </span>
              <span className="text-slate-400 text-xs">chương</span>
            </span>

            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-emerald-300 font-semibold">Bản quyền độc quyền</span>
            </span>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              href={`/truyen/${showcaseStory.slug}`}
              className="px-7 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-white font-bold text-sm rounded-full shadow-lg shadow-blue-500/30 flex items-center gap-2 transition-all duration-200"
            >
              <span>Bắt đầu đọc</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href={`/truyen/${showcaseStory.slug}`}
              className="px-6 py-3 bg-white/10 hover:bg-white/15 active:scale-95 text-white font-semibold text-sm rounded-full border border-white/15 backdrop-blur-md transition-all duration-200"
            >
              Xem tóm tắt
            </Link>
          </div>
        </div>

        {/* ── Layer 2: Cutout 3D Hero Art Parallax ── */}
        <div
          ref={characterLayerRef}
          className="hidden md:flex justify-center items-center will-change-transform relative"
        >
          <div className="relative group cursor-pointer">
            {/* Glowing Backdrop Aura */}
            <div className="absolute -inset-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-3xl opacity-40 blur-2xl group-hover:opacity-60 transition-opacity duration-500" />

            {/* Standout 3D Poster */}
            <div className="relative w-64 lg:w-72 aspect-[2/3] rounded-3xl overflow-hidden border-2 border-white/20 shadow-2xl shadow-black/80 transform -rotate-3 group-hover:rotate-0 transition-transform duration-500">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={showcaseStory.anhBia}
                alt={showcaseStory.tenTruyen}
                className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700"
              />
              <div className="absolute top-3 right-3">
                <span className="flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-orange-500 to-red-600 text-white text-[10px] font-black rounded-full uppercase shadow-lg">
                  <Flame className="w-3 h-3" /> SIÊU PHẨM
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
