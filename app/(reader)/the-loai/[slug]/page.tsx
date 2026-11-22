import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getGenreBySlug } from "@/lib/queries/genre.query";
import { getStoryList } from "@/lib/queries/story-list.query";
import StoryCard from "@/components/story/StoryCard";
import StoryListFilter from "@/components/story/StoryListFilter";
import Pagination from "@/components/common/Pagination";
import EmptyState from "@/components/common/EmptyState";
import { ChevronRight, Layers } from "lucide-react";
import { parseStoryQueryParams } from "@/schemas/story-query.schema";
import StorySearchProvider from "@/components/search/StorySearchProvider";
import SearchInputBar from "@/components/search/SearchInputBar";
import ActiveStoryFilters from "@/components/search/ActiveStoryFilters";

interface GenreDetailPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({
  params,
}: GenreDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const genre = await getGenreBySlug(slug);

  if (!genre) {
    return {
      title: "Không tìm thấy thể loại | WebNovel",
    };
  }

  return {
    title: `Truyện Thể Loại ${genre.tenTheLoai} Hay Nhất | WebNovel`,
    description:
      genre.moTa ||
      `Đọc truyện thể loại ${genre.tenTheLoai} chọn lọc, cập nhật chương mới liên tục tại WebNovel.`,
  };
}

export default async function GenreDetailPage({
  params,
  searchParams,
}: GenreDetailPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;

  const genre = await getGenreBySlug(slug);
  if (!genre) {
    notFound();
  }

  const query = parseStoryQueryParams(resolvedSearchParams);

  const { items, pagination } = await getStoryList({
    ...query,
    theLoai: slug,
    limit: 20,
  });

  return (
    <StorySearchProvider fixed={{ theLoai: slug }}><div className="space-y-8 pb-16">
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
          <Link href="/the-loai" className="hover:text-blue-600 transition-colors">
            Thể loại
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="font-semibold text-slate-800 dark:text-zinc-200">
            {genre.tenTheLoai}
          </span>
        </nav>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-zinc-800/80">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 mb-2 border border-blue-200/60 dark:border-blue-800/40">
              <Layers className="w-3.5 h-3.5" />
              <span>Thể loại truyện</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-zinc-100">
              Truyện {genre.tenTheLoai}
            </h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl">
              {genre.moTa ||
                `Tổng hợp các tác phẩm ${genre.tenTheLoai} hay nhất, được chọn lọc và cập nhật liên tục.`}
            </p>
          </div>

          <div className="text-xs sm:text-sm font-medium text-slate-500 dark:text-zinc-400 shrink-0">
            Tổng cộng:{" "}
            <span className="font-bold text-slate-900 dark:text-zinc-100">
              {pagination.total}
            </span>{" "}
            tác phẩm
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <SearchInputBar />
      <StoryListFilter />
      <ActiveStoryFilters />

      {/* Story Grid / Empty State */}
      {items.length === 0 ? (
        <EmptyState
          title={`Chưa có truyện ${genre.tenTheLoai} phù hợp`}
          description="Không tìm thấy tác phẩm nào với bộ lọc hiện tại. Thử chọn lại trạng thái hoặc số chương khác."
          resetHref={`/the-loai/${slug}`}
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
