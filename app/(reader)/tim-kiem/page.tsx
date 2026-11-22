import type { Metadata } from "next";
import Link from "next/link";
import { getStoryList } from "@/lib/queries/story-list.query";
import { getAllGenresWithCount } from "@/lib/queries/genre.query";
import StoryCard from "@/components/story/StoryCard";
import StoryListFilter from "@/components/story/StoryListFilter";
import SearchInputBar from "@/components/search/SearchInputBar";
import SearchGenreChips from "@/components/search/SearchGenreChips";
import Pagination from "@/components/common/Pagination";
import EmptyState from "@/components/common/EmptyState";
import { Search, ChevronRight } from "lucide-react";
import { parseStoryQueryParams } from "@/schemas/story-query.schema";
import StorySearchProvider from "@/components/search/StorySearchProvider";
import ActiveStoryFilters from "@/components/search/ActiveStoryFilters";

export const metadata: Metadata = {
  title: "Tìm Kiếm Truyện Nâng Cao | WebNovel",
  description:
    "Tìm kiếm truyện chữ theo tên truyện, tác giả, thể loại, tình trạng ra chương và nhiều tiêu chí nâng cao tại WebNovel.",
};

interface SearchPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const resolvedSearchParams = await searchParams;

  const query = parseStoryQueryParams(resolvedSearchParams);

  const [genres, { items, pagination }] = await Promise.all([
    getAllGenresWithCount(),
    getStoryList({
      ...query,
      limit: 20,
    }),
  ]);

  return (
    <StorySearchProvider><div className="space-y-8 pb-16">
      {/* Breadcrumb & Header */}
      <div className="space-y-4">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400"
        >
          <Link href="/" className="hover:text-blue-600 transition-colors">
            Trang chủ
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="font-semibold text-slate-800 dark:text-zinc-200">
            Tìm kiếm truyện
          </span>
        </nav>

        <div className="text-center max-w-xl mx-auto space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40">
            <Search className="w-3.5 h-3.5" />
            <span>Bộ máy tra cứu</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-zinc-100">
            Tìm Kiếm Tác Phẩm
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400">
            Khám phá kho tàng truyện chữ với bộ lọc đa điều kiện thông minh.
          </p>
        </div>

        {/* Search Bar */}
        <div className="pt-2">
          <SearchInputBar />
        </div>
      </div>

      {/* Genre Filter Chips */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
          Lọc theo thể loại
        </div>
        <SearchGenreChips genres={genres} />
      </div>

      {/* Filter Bar (Sort, Status, Chapter count) */}
      <StoryListFilter />
      <ActiveStoryFilters genres={genres} />

      {/* Results Header */}
      <div className="flex items-center justify-between text-xs sm:text-sm text-slate-500 dark:text-zinc-400 px-1">
        <div>
          {query.q ? (
            <span>
              Kết quả cho từ khóa:{" "}
              <strong className="text-slate-900 dark:text-zinc-100">
                &ldquo;{query.q}&rdquo;
              </strong>
            </span>
          ) : (
            <span>Danh sách tác phẩm phù hợp</span>
          )}
        </div>
        <div aria-live="polite">
          Tìm thấy <strong className="text-slate-900 dark:text-zinc-100">{pagination.total}</strong> truyện
        </div>
      </div>

      {/* Story Grid / Empty State */}
      {items.length === 0 ? (
        <EmptyState
          title="Không tìm thấy truyện nào"
          description={
            query.q
              ? `Không có kết quả nào phù hợp với từ khóa "${query.q}". Thử từ khóa khác hoặc xóa bớt tiêu chí lọc.`
              : "Không có truyện nào phù hợp với các bộ lọc đã chọn."
          }
          resetHref="/tim-kiem"
          resetLabel="Xóa bộ lọc tìm kiếm"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
            {items.map((story) => (
              <StoryCard key={story.idTruyen} story={story} />
            ))}
          </div>

          {/* Pagination */}
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
          />
        </>
      )}
    </div></StorySearchProvider>
  );
}
