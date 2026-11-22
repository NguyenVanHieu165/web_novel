"use client";

import { useRef } from "react";
import Link from "next/link";
import { Clock, ChevronRight } from "lucide-react";
import SectionHeader from "@/components/common/SectionHeader";
import { gsap, useGSAP } from "@/lib/gsap";

interface UpdatedItem {
  idTruyen: number;
  tenTruyen: string;
  slug: string;
  anhBia: string;
  latestChapterName?: string | null;
  latestChapterSlug?: string | null;
  genres?: string[];
  updatedAt?: Date | string | null;
}

interface RecentlyUpdatedProps {
  items: UpdatedItem[];
}

function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return `${seconds} giây`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} phút`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} giờ`;
  const days = Math.floor(hrs / 24);
  return `${days} ngày`;
}

export default function RecentlyUpdated({ items }: RecentlyUpdatedProps) {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (!sectionRef.current || items.length === 0) return;

      gsap.from(".update-row-item", {
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 80%",
          once: true,
        },
        x: -30,
        opacity: 0,
        duration: 0.5,
        stagger: 0.04,
        ease: "power2.out",
        clearProps: "transform,opacity",
      });
    },
    { dependencies: [items.length], scope: sectionRef }
  );

  return (
    <section ref={sectionRef} className="py-2">
      <SectionHeader title="Mới Cập Nhật" href="/truyen-moi" />

      {/* Desktop: Table-like list with Animated Rows */}
      <div className="hidden md:block bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200/80 dark:border-zinc-800 overflow-hidden shadow-sm">
        {/* Header Row */}
        <div className="grid grid-cols-[2fr_1.5fr_1fr_auto] gap-4 px-6 py-3.5 text-xs font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500 border-b border-slate-100 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-900/50">
          <span>Tác phẩm</span>
          <span>Chương mới nhất</span>
          <span>Thể loại</span>
          <span>Cập nhật</span>
        </div>

        {items.map((item, index) => (
          <div
            key={item.idTruyen}
            className={`update-row-item grid grid-cols-[2fr_1.5fr_1fr_auto] gap-4 items-center px-6 py-3.5 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 hover:translate-x-1.5 transition-all duration-200 group ${
              index < items.length - 1
                ? "border-b border-slate-100 dark:border-zinc-800/60"
                : ""
            }`}
          >
            {/* Story name + cover thumbnail */}
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="relative w-10 h-14 rounded-xl overflow-hidden shrink-0 bg-slate-100 dark:bg-zinc-800 shadow-xs group-hover:scale-105 transition-transform duration-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    item.anhBia ||
                    "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=100&q=60"
                  }
                  alt={item.tenTruyen}
                  width={40}
                  height={56}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="min-w-0">
                <Link
                  href={`/truyen/${item.slug}`}
                  className="font-bold text-sm text-slate-800 dark:text-zinc-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1 flex items-center gap-1.5"
                >
                  <span>{item.tenTruyen}</span>
                  {index < 3 && (
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                  )}
                </Link>
              </div>
            </div>

            {/* Latest chapter */}
            {item.latestChapterSlug ? (
              <Link
                href={`/truyen/${item.slug}/${item.latestChapterSlug}`}
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium flex items-center gap-1 line-clamp-1 group/chap"
              >
                <span className="line-clamp-1">{item.latestChapterName || "Chương mới"}</span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0 group-hover/chap:translate-x-1 transition-transform" />
              </Link>
            ) : (
              <span className="text-sm text-slate-400">—</span>
            )}

            {/* Genre */}
            <span className="text-xs text-slate-400 dark:text-zinc-500 line-clamp-1 font-medium">
              {item.genres?.[0] || "—"}
            </span>

            {/* Time */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-zinc-500 whitespace-nowrap">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{timeAgo(item.updatedAt)} trước</span>
            </div>
          </div>
        ))}
      </div>

      {/* Mobile: Card list */}
      <div className="md:hidden space-y-2.5">
        {items.map((item) => (
          <div
            key={item.idTruyen}
            className="update-row-item flex gap-3.5 p-3.5 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/80 dark:border-zinc-800 shadow-xs hover:shadow-md transition-all group"
          >
            <div className="w-14 h-18 shrink-0 rounded-xl overflow-hidden bg-slate-100 dark:bg-zinc-800 shadow-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  item.anhBia ||
                  "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=100&q=60"
                }
                alt={item.tenTruyen}
                width={56}
                height={72}
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="min-w-0 flex-1 flex flex-col justify-between py-0.5">
              <Link
                href={`/truyen/${item.slug}`}
                className="font-bold text-sm text-slate-800 dark:text-zinc-100 line-clamp-1 group-hover:text-blue-600 transition-colors"
              >
                {item.tenTruyen}
              </Link>
              <p className="text-xs text-blue-600 dark:text-blue-400 line-clamp-1 font-medium">
                {item.latestChapterName || "Chưa có chương"}
              </p>
              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                <Clock className="w-3 h-3" />
                {timeAgo(item.updatedAt)} trước
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
