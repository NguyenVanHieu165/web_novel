import Link from "next/link";
import { Eye, Star, TrendingUp } from "lucide-react";
import SectionHeader from "@/components/common/SectionHeader";
import StoryGrid from "@/components/story/StoryGrid";
import { StoryCardData } from "@/components/story/StoryCard";

interface PopularStoriesProps {
  topStories: StoryCardData[];
  gridStories: StoryCardData[];
}

const RANK_COLORS = [
  "bg-gradient-to-br from-yellow-400 to-orange-500 text-white shadow-md shadow-orange-300/40",
  "bg-gradient-to-br from-slate-400 to-slate-600 text-white shadow-md shadow-slate-300/40",
  "bg-gradient-to-br from-amber-600 to-amber-800 text-white shadow-md shadow-amber-500/30",
  "bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400",
  "bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400",
];

export default function PopularStories({ topStories, gridStories }: PopularStoriesProps) {
  return (
    <section>
      <SectionHeader title="Truyện phổ biến" href="/xep-hang" />
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
        {/* Left: Top 5 Ranked List */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800/80 p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-sm text-slate-700 dark:text-zinc-200">Top Lượt Xem</h3>
          </div>

          {topStories.slice(0, 5).map((story, i) => (
            <Link
              key={story.idTruyen}
              href={`/truyen/${story.slug}`}
              className="flex items-center gap-3 group py-1"
            >
              {/* Rank badge */}
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center font-extrabold text-sm shrink-0 ${
                  RANK_COLORS[i] || RANK_COLORS[4]
                }`}
              >
                {i + 1}
              </div>

              {/* Cover thumbnail */}
              <div className="w-10 h-14 rounded-md overflow-hidden shrink-0 bg-slate-100 dark:bg-zinc-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={story.anhBia || "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=100&q=60"}
                  alt={story.tenTruyen}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-xs text-slate-700 dark:text-zinc-200 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {story.tenTruyen}
                </p>
                <div className="flex items-center gap-3 text-[10px] text-slate-400 dark:text-zinc-500 mt-1">
                  <span className="flex items-center gap-0.5">
                    <Eye className="w-3 h-3" />
                  {(story.luotXem || 0).toLocaleString("vi-VN")}
                  </span>
                  {story.diemDanhGiaTrungBinh && (
                    <span className="flex items-center gap-0.5">
                      <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                      {parseFloat(story.diemDanhGiaTrungBinh.toString()).toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Right: Story Grid */}
        <StoryGrid stories={gridStories} cols={4} />
      </div>
    </section>
  );
}
