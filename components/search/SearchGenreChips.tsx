"use client";

import type { GenreItem } from "@/lib/queries/genre.query";
import { useStorySearchNavigation } from "./StorySearchProvider";
import { Button } from "@/components/ui/button";

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
        return <Button key={option.slug} type="button" aria-pressed={active}
          variant={active ? "default" : "outline"} size="sm"
          onClick={() => controller.update({ theLoai: option.slug || undefined })}
          className="shrink-0 rounded-xl">
          {option.name}
        </Button>;
      })}
    </div>
  );
}
