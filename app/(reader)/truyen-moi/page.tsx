import type { Metadata } from "next";
import Link from "next/link";
import { getStoryList } from "@/lib/queries/story-list.query";
import StoryCard from "@/components/story/StoryCard";
import StoryListFilter from "@/components/story/StoryListFilter";
import Pagination from "@/components/common/Pagination";
import EmptyState from "@/components/common/EmptyState";
import { Sparkles, ChevronRight } from "lucide-react";
import { parseStoryQueryParams } from "@/schemas/story-query.schema";
import StorySearchProvider from "@/components/search/StorySearchProvider";
import SearchInputBar from "@/components/search/SearchInputBar";
import ActiveStoryFilters from "@/components/search/ActiveStoryFilters";
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from "@/components/shared/page-header";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Truyện Mới Cập Nhật – Danh Sách Truyện Mới Nhất | WebNovel",
  description:
    "Danh sách truyện chữ mới ra mắt, vừa cập nhật chương mới nhất tại WebNovel. Đọc truyện online miễn phí chất lượng cao.",
};

interface TruyenMoiPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function TruyenMoiPage({ searchParams }: TruyenMoiPageProps) {
  const resolvedSearchParams = await searchParams;

  const query = parseStoryQueryParams(resolvedSearchParams, { sapXep: "moiNhat" });

  const { items, pagination } = await getStoryList({
    ...query,
    limit: 20,
  });

  return (
    <StorySearchProvider defaults={{ sapXep: "moiNhat" }}><div className="space-y-8 pb-16">
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
            Truyện mới
          </span>
        </nav>

        <PageHeader>
          <PageHeaderContent>
            <PageHeaderEyebrow className="flex items-center gap-2 text-success"><Sparkles aria-hidden="true" className="size-3.5" />Cập nhật liên tục</PageHeaderEyebrow>
            <PageHeaderTitle>Truyện Mới Ra Mắt & Cập Nhật</PageHeaderTitle>
            <PageHeaderDescription>
              Tuyển tập những bộ truyện vừa được đăng tải và có chương mới nhất trên toàn hệ thống WebNovel.
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
          title="Chưa có truyện mới phù hợp"
          description="Hiện chưa có tác phẩm nào với bộ lọc này. Hãy thử chọn lại các tiêu chí tìm kiếm."
          resetHref="/truyen-moi"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
            {items.map((story) => (
              <StoryCard
                key={story.idTruyen}
                story={{ ...story, badge: story.badge || "moi" }}
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
