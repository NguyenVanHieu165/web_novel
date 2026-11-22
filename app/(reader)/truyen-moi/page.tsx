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
          className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400"
        >
          <Link href="/" className="hover:text-blue-600 transition-colors">
            Trang chủ
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="font-semibold text-slate-800 dark:text-zinc-200">
            Truyện mới
          </span>
        </nav>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-zinc-800/80">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 mb-2 border border-emerald-200/60 dark:border-emerald-800/40">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Cập nhật liên tục</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-zinc-100">
              Truyện Mới Ra Mắt & Cập Nhật
            </h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl">
              Tuyển tập những bộ truyện vừa được đăng tải và có chương mới nhất trên toàn hệ thống WebNovel.
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
