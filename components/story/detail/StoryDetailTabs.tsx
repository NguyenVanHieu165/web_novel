"use client";

import { useState } from "react";
import { FileText, List, Star } from "lucide-react";
import dynamic from "next/dynamic";
import { ChapterListSkeleton, CommentSkeleton } from "@/components/common/InteractionSkeleton";
import CommentSection from "@/components/comments/LazyCommentSection";
import { StoryDetailData } from "@/lib/mappers/story-detail.mapper";

interface StoryDetailTabsProps {
  story: StoryDetailData;
}

const ChapterList = dynamic(() => import("./ChapterList"), { ssr: false, loading: ChapterListSkeleton });
const StoryReviews = dynamic(() => import("./StoryReviews"), { ssr: false, loading: CommentSkeleton });

export default function StoryDetailTabs({ story }: StoryDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<"synopsis" | "chapters" | "reviews">("synopsis");

  return (
    <div className="space-y-8">
      {/* Tab Navigation Buttons */}
      <div className="flex items-center gap-2 border-b border-slate-200/80 dark:border-zinc-800 pb-3 overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab("synopsis")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-200 cursor-pointer ${
            activeTab === "synopsis"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/60"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Giới thiệu</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("chapters")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-200 cursor-pointer ${
            activeTab === "chapters"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/60"
          }`}
        >
          <List className="w-4 h-4" />
          <span>Danh sách chương ({story.soChuong})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("reviews")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-200 cursor-pointer ${
            activeTab === "reviews"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/60"
          }`}
        >
          <Star className="w-4 h-4" />
          <span>Đánh giá & Thảo luận</span>
        </button>
      </div>

      {/* Tab 1: Synopsis / Description */}
      {activeTab === "synopsis" && (
        <div className="space-y-8 animate-fadeIn">
          {/* Main Description */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200/80 dark:border-zinc-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
              Tóm tắt nội dung
            </h3>
            <div className="text-sm sm:text-base text-slate-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line space-y-3">
              {story.moTa}
            </div>
          </div>

          {/* Quick Chapters Preview */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200/80 dark:border-zinc-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                Chương mới nhất
              </h3>
              <button
                type="button"
                onClick={() => setActiveTab("chapters")}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Xem tất cả {story.soChuong} chương &rarr;
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {story.chapters.map((chap) => (
                <a
                  key={chap.idChuong}
                  href={`/truyen/${story.slug}/${chap.slug}`}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/50 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 text-xs text-slate-800 dark:text-zinc-200 transition-colors"
                >
                  <span className="font-semibold truncate pr-2">{chap.tieuDeChuong}</span>
                  <span className="text-[11px] text-slate-400 shrink-0">{chap.updatedAt}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Full Chapter List */}
      {activeTab === "chapters" && (
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200/80 dark:border-zinc-800 p-6 sm:p-8 shadow-sm">
          <ChapterList key={story.slug} storySlug={story.slug} />
        </div>
      )}

      {/* Tab 3: Reviews & Discussion */}
      {activeTab === "reviews" && (
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200/80 dark:border-zinc-800 p-6 sm:p-8 shadow-sm">
          <StoryReviews
            key={story.idTruyen}
            storyId={story.idTruyen}
            storySlug={story.slug}
            averageRating={story.diemDanhGiaTrungBinh}
            totalRatings={story.soLuotDanhGia}
            reviews={story.reviews}
            comments={story.comments}
          />
            <div className="mt-8 border-t pt-8">
              <CommentSection storySlug={story.slug} />
            </div>
        </div>
      )}
    </div>
  );
}
