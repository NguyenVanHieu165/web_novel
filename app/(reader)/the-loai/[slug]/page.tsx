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
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from "@/components/shared/page-header";

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
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Link href="/" className="transition-colors hover:text-primary">
            Trang chủ
          </Link>
          <ChevronRight aria-hidden="true" className="size-3.5" />
          <Link href="/the-loai" className="transition-colors hover:text-primary">
            Thể loại
          </Link>
          <ChevronRight aria-hidden="true" className="size-3.5" />
          <span className="font-semibold text-foreground">
            {genre.tenTheLoai}
          </span>
        </nav>

        <PageHeader>
          <PageHeaderContent>
            <PageHeaderEyebrow className="flex items-center gap-2 text-primary"><Layers aria-hidden="true" className="size-3.5" />Thể loại truyện</PageHeaderEyebrow>
            <PageHeaderTitle>Truyện {genre.tenTheLoai}</PageHeaderTitle>
            <PageHeaderDescription>
              {genre.moTa ||
                `Tổng hợp các tác phẩm ${genre.tenTheLoai} hay nhất, được chọn lọc và cập nhật liên tục.`}
            </PageHeaderDescription>
          </PageHeaderContent>
          <PageHeaderActions className="text-xs font-medium text-muted-foreground sm:text-sm">
            Tổng cộng:{" "}
            <span className="font-bold text-foreground">
              {pagination.total}
            </span>{" "}
            tác phẩm
          </PageHeaderActions>
        </PageHeader>
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
