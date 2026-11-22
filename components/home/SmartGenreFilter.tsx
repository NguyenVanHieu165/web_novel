import Link from "next/link";
import SectionHeader from "@/components/common/SectionHeader";
import StoryCard, { StoryCardData } from "@/components/story/StoryCard";
import { mergeUniqueStories, type HomeGenreLink } from "@/lib/home-discovery";

interface SmartGenreFilterProps {
  stories: StoryCardData[];
  genres: HomeGenreLink[];
}

export default function SmartGenreFilter({ stories, genres }: SmartGenreFilterProps) {
  const suggestions = mergeUniqueStories(stories).slice(0, 10);

  return (
    <section className="py-4">
      <SectionHeader title="Khám Phá Theo Thể Loại" href="/the-loai" />

      <nav aria-label="Khám phá kho truyện theo thể loại" className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-none mb-4">
        <Link href="/the-loai" className="px-4 py-2 rounded-full bg-blue-600 text-white text-xs font-bold whitespace-nowrap shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">Tất cả thể loại</Link>
        {genres.slice(0, 7).map((genre) => (
          <Link
            key={genre.idTheLoai}
            href={`/the-loai/${genre.idTheLoai}`}
            className="px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap shadow-sm bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white border border-slate-200/80 dark:border-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {genre.tenTheLoai}
          </Link>
        ))}
      </nav>
      <p className="mb-5 text-sm text-slate-500 dark:text-zinc-400">Chọn thể loại để xem toàn bộ truyện. Một số gợi ý dành cho bạn:</p>

      {suggestions.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {suggestions.map((story) => (
            <div key={story.idTruyen}>
              <StoryCard story={story} />
            </div>
          ))}
        </div>
      ) : (
        <div className="py-16 text-center bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200/80 dark:border-zinc-800">
          <p className="text-sm text-slate-400">
            Chưa có truyện gợi ý. Bạn có thể khám phá thêm trong danh sách thể loại.
          </p>
        </div>
      )}
    </section>
  );
}
