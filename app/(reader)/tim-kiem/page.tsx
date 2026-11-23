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
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from "@/components/shared/page-header";

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
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Link href="/" className="transition-colors hover:text-primary">
            Trang chủ
          </Link>
          <ChevronRight aria-hidden="true" className="size-3.5" />
          <span className="font-semibold text-foreground">
            Tìm kiếm truyện
          </span>
        </nav>

        <PageHeader className="mx-auto max-w-2xl justify-center text-center sm:items-center">
          <PageHeaderContent>
          <PageHeaderEyebrow className="flex items-center justify-center gap-2 text-primary"><Search aria-hidden="true" className="size-3.5" />Bộ máy tra cứu</PageHeaderEyebrow>
          <PageHeaderTitle>Tìm Kiếm Tác Phẩm</PageHeaderTitle>
          <PageHeaderDescription className="mx-auto">
            Khám phá kho tàng truyện chữ với bộ lọc đa điều kiện thông minh.
          </PageHeaderDescription>
          </PageHeaderContent>
        </PageHeader>

        {/* Search Bar */}
        <div className="pt-2">
          <SearchInputBar />
        </div>
      </div>

      {/* Genre Filter Chips */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Lọc theo thể loại
        </div>
        <SearchGenreChips genres={genres} />
      </div>

      {/* Filter Bar (Sort, Status, Chapter count) */}
      <StoryListFilter />
      <ActiveStoryFilters genres={genres} />

      {/* Results Header */}
      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground sm:text-sm">
        <div>
          {query.q ? (
            <span>
              Kết quả cho từ khóa:{" "}
              <strong className="text-foreground">
                &ldquo;{query.q}&rdquo;
              </strong>
            </span>
          ) : (
            <span>Danh sách tác phẩm phù hợp</span>
          )}
        </div>
        <div aria-live="polite">
          Tìm thấy <strong className="text-foreground">{pagination.total}</strong> truyện
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
