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
          className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400"
        >
          <Link href="/" className="hover:text-blue-600 transition-colors">
            Trang chủ
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="font-semibold text-slate-800 dark:text-zinc-200">
            Truyện Full
          </span>
        </nav>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-zinc-800/80">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 mb-2 border border-indigo-200/60 dark:border-indigo-800/40">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Đã ra trọn bộ</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-zinc-100">
              Truyện Full Đã Hoàn Thành
            </h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl">
              Đọc liền mạch từ đầu đến cuối không gián đoạn với tuyển tập truyện đã kết thúc trọn vẹn.
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
