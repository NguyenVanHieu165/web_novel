"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, List, Star } from "lucide-react";
import dynamic from "next/dynamic";
import { ChapterListSkeleton, CommentSkeleton } from "@/components/common/InteractionSkeleton";
import CommentSection from "@/components/comments/LazyCommentSection";
import { StoryDetailData } from "@/lib/mappers/story-detail.mapper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
      <div className="flex items-center gap-2 overflow-x-auto border-b pb-3 scrollbar-none">
        <Button
          type="button"
          variant={activeTab === "synopsis" ? "default" : "ghost"}
          onClick={() => setActiveTab("synopsis")}
          className="rounded-2xl px-5 font-bold"
        >
          <FileText aria-hidden="true" />
          <span>Giới thiệu</span>
        </Button>

        <Button
          type="button"
          variant={activeTab === "chapters" ? "default" : "ghost"}
          onClick={() => setActiveTab("chapters")}
          className="rounded-2xl px-5 font-bold"
        >
          <List aria-hidden="true" />
          <span>Danh sách chương ({story.soChuong})</span>
        </Button>

        <Button
          type="button"
          variant={activeTab === "reviews" ? "default" : "ghost"}
          onClick={() => setActiveTab("reviews")}
          className="rounded-2xl px-5 font-bold"
        >
          <Star aria-hidden="true" />
          <span>Đánh giá & Thảo luận</span>
        </Button>
      </div>

      {/* Tab 1: Synopsis / Description */}
      {activeTab === "synopsis" && (
        <div className="space-y-8 animate-fadeIn">
          {/* Main Description */}
          <Card className="rounded-3xl">
            <CardHeader><CardTitle className="text-base font-black sm:text-lg">Tóm tắt nội dung</CardTitle></CardHeader>
            <CardContent className="space-y-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground sm:text-base">
              {story.moTa}
            </CardContent>
          </Card>

          {/* Quick Chapters Preview */}
          <Card className="rounded-3xl">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base font-black sm:text-lg">Chương mới nhất</CardTitle>
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => setActiveTab("chapters")}
                className="text-xs font-bold"
              >
                Xem tất cả {story.soChuong} chương &rarr;
              </Button>
            </CardHeader>

            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {story.chapters.map((chap) => (
                <Link
                  key={chap.idChuong}
                  href={`/truyen/${story.slug}/${chap.slug}`}
                  prefetch
                  className="flex items-center justify-between rounded-xl bg-muted/50 p-3 text-xs transition-colors hover:bg-muted"
                >
                  <span className="font-semibold truncate pr-2">{chap.tieuDeChuong}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{chap.updatedAt}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 2: Full Chapter List */}
      {activeTab === "chapters" && (
        <Card className="rounded-3xl"><CardContent><ChapterList key={story.slug} storySlug={story.slug} /></CardContent></Card>
      )}

      {/* Tab 3: Reviews & Discussion */}
      {activeTab === "reviews" && (
        <Card className="rounded-3xl"><CardContent>
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
        </CardContent></Card>
      )}
    </div>
  );
}
