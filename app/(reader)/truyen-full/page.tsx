import type { Metadata } from "next";
import Link from "next/link";
import { getStoryList } from "@/lib/queries/story-list.query";
import StoryCard from "@/components/story/StoryCard";
import StoryListFilter from "@/components/story/StoryListFilter";
import Pagination from "@/components/common/Pagination";
import EmptyState from "@/components/common/EmptyState";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { parseStoryQueryParams } from "@/schemas/story-query.schema";
import StorySearchProvider from "@/components/search/StorySearchProvider";
import SearchInputBar from "@/components/search/SearchInputBar";
import ActiveStoryFilters from "@/components/search/ActiveStoryFilters";
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from "@/components/shared/page-header";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Truyện Full Hoàn Thành – Danh Sách Truyện Đã Ra Hết | WebNovel",
  description:
    "Tổng hợp những bộ truyện chữ đã hoàn thành (Full), đọc liền mạch không lo ngóng chờ chương mới tại WebNovel.",
};

interface TruyenFullPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function TruyenFullPage({ searchParams }: TruyenFullPageProps) {
  const resolvedSearchParams = await searchParams;

  const query = parseStoryQueryParams(resolvedSearchParams, {
    trangThai: "hoan_thanh",
  });

  const { items, pagination } = await getStoryList({
    ...query,
    trangThai: "hoan_thanh",
    limit: 20,
  });

  return (
    <StorySearchProvider defaults={{ trangThai: "hoan_thanh" }} fixed={{ trangThai: "hoan_thanh" }}><div className="space-y-8 pb-16">
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
            Truyện Full
          </span>
        </nav>

        <PageHeader>
          <PageHeaderContent>
            <PageHeaderEyebrow className="flex items-center gap-2 text-info"><CheckCircle2 aria-hidden="true" className="size-3.5" />Đã ra trọn bộ</PageHeaderEyebrow>
            <PageHeaderTitle>Truyện Full Đã Hoàn Thành</PageHeaderTitle>
            <PageHeaderDescription>
              Đọc liền mạch từ đầu đến cuối không gián đoạn với tuyển tập truyện đã kết thúc trọn vẹn.
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

      {/* Filter Bar (Only Sort & Chapters, status fixed to 'hoan_thanh') */}
      <SearchInputBar />
      <StoryListFilter fixedStatus="hoan_thanh" />
      <ActiveStoryFilters />

      {/* Story Grid / Empty State */}
      {items.length === 0 ? (
        <EmptyState
          title="Chưa có truyện hoàn thành phù hợp"
          description="Hiện chưa có truyện đã hoàn thành nào khớp với tiêu chí bạn chọn."
          resetHref="/truyen-full"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
            {items.map((story) => (
              <StoryCard
                key={story.idTruyen}
                story={{ ...story, badge: "full" }}
              />
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
