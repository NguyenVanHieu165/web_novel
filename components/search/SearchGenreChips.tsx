"use client";

import type { GenreItem } from "@/lib/queries/genre.query";
import { useStorySearchNavigation } from "./StorySearchProvider";

export default function SearchGenreChips({ genres }: { genres: GenreItem[] }) {
  const { query, controller } = useStorySearchNavigation();
  const current = query.theLoai;
  const options = [{ slug: "", name: "Tất cả thể loại" }, ...genres.map((genre) => ({
    slug: genre.slug, name: `${genre.tenTheLoai} (${genre.storyCount.toLocaleString("vi-VN")})`,
  }))];
  return (
    <div role="group" aria-label="Lọc theo thể loại" className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
      {options.map((option) => {
        const active = (current ?? "") === option.slug;
        return <button key={option.slug} type="button" aria-pressed={active}
          onClick={() => controller.update({ theLoai: option.slug || undefined })}
          className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${active
            ? "border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-500/20"
            : "border-slate-200 bg-white text-slate-600 hover:border-blue-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-blue-600"}`}>
          {option.name}
        </button>;
      })}
    </div>
  );
}
