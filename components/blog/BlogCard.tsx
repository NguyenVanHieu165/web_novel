"use client";

import { useRef } from "react";
import Link from "next/link";
import { Calendar, Tag, ArrowUpRight } from "lucide-react";
import { gsap } from "@/lib/gsap";

interface BlogCardProps {
  thumbnail?: string;
  category: string;
  title: string;
  description?: string;
  date?: string;
  href?: string;
}

export default function BlogCard({
  thumbnail,
  category,
  title,
  description,
  date,
  href = "#",
}: BlogCardProps) {
  const cardRef = useRef<HTMLAnchorElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;

    gsap.to(cardRef.current, {
      rotateY: x * 10,
      rotateX: -y * 10,
      transformPerspective: 900,
      duration: 0.25,
      ease: "power2.out",
      overwrite: "auto",
    });
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
  };

  return (
    <Link
      ref={cardRef}
      href={href}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="blog-card-item group relative flex flex-col bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200/80 dark:border-zinc-800 shadow-sm hover:shadow-2xl hover:shadow-blue-500/10 transition-shadow duration-300 overflow-hidden"
      style={{ transformStyle: "preserve-3d" }}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-slate-100 dark:bg-zinc-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={
            thumbnail ||
            "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&auto=format&fit=crop&q=60"
          }
          alt={title}
          className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-500 select-none"
          loading="lazy"
        />

        {/* Category badge */}
        <span className="absolute top-3.5 left-3.5 flex items-center gap-1 px-3 py-1 bg-slate-900/80 backdrop-blur-md border border-white/20 text-white text-[10px] font-black uppercase tracking-wider rounded-full shadow-md">
          <Tag className="w-2.5 h-2.5 text-blue-400" />
          <span>{category}</span>
        </span>

        {/* Floating Read Icon */}
        <div className="absolute top-3.5 right-3.5 w-8 h-8 rounded-full bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md flex items-center justify-center text-slate-800 dark:text-white opacity-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-200 shadow-md">
          <ArrowUpRight className="w-4 h-4" />
        </div>
      </div>

      {/* Content */}
      <div className="p-5 space-y-2.5 flex-1 flex flex-col">
        <h3 className="font-bold text-base text-slate-900 dark:text-zinc-100 line-clamp-2 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-150">
          {title}
        </h3>

        {description && (
          <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
            {description}
          </p>
        )}

        {date && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-zinc-500 mt-auto pt-3 border-t border-slate-100 dark:border-zinc-800/80">
            <Calendar className="w-3.5 h-3.5" />
            <span>{date}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
