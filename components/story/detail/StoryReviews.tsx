"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Star, MessageSquare, ThumbsUp, Send, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReviewItemData, CommentItemData } from "@/lib/mappers/story-detail.mapper";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import StoryRatingForm from "./StoryRatingForm";
import StoryCommentReplies from "./StoryCommentReplies";
import { commentsPageSchema, createdCommentSchema, commentErrorSchema as errorResponseSchema } from "./comment-response";
import { EmptyState, EmptyStateDescription, EmptyStateIcon, EmptyStateTitle } from "@/components/shared/empty-state";
import { ErrorState, ErrorStateActions, ErrorStateDescription, ErrorStateTitle } from "@/components/shared/error-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Textarea } from "@/components/ui/textarea";

interface StoryReviewsProps {
  storyId: number;
  storySlug: string;
  averageRating: number;
  totalRatings: number;
  reviews: ReviewItemData[];
  comments: CommentItemData[];
}

const pageSize = 15;

export default function StoryReviews({
  storyId,
  storySlug,
  averageRating,
  totalRatings,
  reviews,
  comments,
}: StoryReviewsProps) {
  const { user } = useAuth();
  const [commentText, setCommentText] = useState("");
  const [commentList, setCommentList] = useState<CommentItemData[]>(comments);
  const [activeSubTab, setActiveSubTab] = useState<"reviews" | "comments">("reviews");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(comments.length);
  const [totalPage, setTotalPage] = useState(1);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const postInFlight = useRef(false);
  const requiresLogin = !user || sessionExpired;
  const returnPath = `/truyen/${storySlug}`;

  useEffect(() => {
    if (activeSubTab !== "comments") return;
    const controller = new AbortController();
    fetch(`/api/truyen/${encodeURIComponent(storySlug)}/comments?page=${page}&limit=${pageSize}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const parsed = commentsPageSchema.safeParse(await response.json());
        if (!response.ok || !parsed.success) throw new Error("Không thể tải bình luận. Vui lòng thử lại.");
        if (controller.signal.aborted) return;
        setCommentList(parsed.data.data);
        setTotal(parsed.data.meta.total);
        setTotalPage(parsed.data.meta.totalPage);
        setCommentsError(null);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setCommentsError(error instanceof Error ? error.message : "Không thể tải bình luận.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCommentsLoading(false);
      });
    return () => controller.abort();
  }, [activeSubTab, storySlug, page, refreshVersion]);

  const changePage = (nextPage: number) => {
    setCommentsLoading(true);
    setCommentsError(null);
    setPage(nextPage);
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (postInFlight.current || requiresLogin || !commentText.trim()) return;
    postInFlight.current = true;
    setPosting(true);
    setPostError(null);
    try {
      const response = await fetch(`/api/truyen/${encodeURIComponent(storySlug)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noiDung: commentText.trim() }),
      });
      const payload: unknown = await response.json();
      const parsed = createdCommentSchema.safeParse(payload);
      if (!response.ok || !parsed.success) {
        if (response.status === 401) setSessionExpired(true);
        const error = errorResponseSchema.safeParse(payload);
        throw new Error(error.success ? error.data.message : "Không thể đăng bình luận. Vui lòng thử lại.");
      }
      setCommentText("");
      setCommentList((previous) => [parsed.data.data, ...previous].slice(0, pageSize));
      setTotal((previous) => previous + 1);
      setPage(1);
      setRefreshVersion((previous) => previous + 1);
      toast.success("Đã đăng bình luận của bạn.");
    } catch (error) {
      setPostError(error instanceof Error ? error.message : "Không thể đăng bình luận. Vui lòng thử lại.");
    } finally {
      postInFlight.current = false;
      setPosting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Rating Score Card */}
      <Card className="flex-col items-center justify-between gap-6 rounded-3xl bg-muted/30 p-6 sm:flex-row sm:p-8">
        <div className="flex items-center gap-5">
          <div className="text-4xl font-black sm:text-5xl">
            {averageRating.toFixed(1)}
          </div>
          <div>
            <div className="flex items-center gap-1 text-warning">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`w-5 h-5 ${
                    s <= Math.round(averageRating)
                      ? "fill-warning text-warning"
                      : "text-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              Dựa trên {totalRatings} lượt đánh giá từ độc giả
            </p>
          </div>
        </div>

        {/* Sub-tabs switcher */}
        <div className="flex items-center gap-2 rounded-2xl border bg-background p-1">
          <Button
            type="button"
            size="sm"
            variant={activeSubTab === "reviews" ? "default" : "ghost"}
            onClick={() => setActiveSubTab("reviews")}
            aria-pressed={activeSubTab === "reviews"}
            className="rounded-xl px-4 font-bold"
          >
            <Star aria-hidden="true" />
            <span>Đánh giá ({totalRatings})</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeSubTab === "comments" ? "default" : "ghost"}
            onClick={() => {
              if (activeSubTab !== "comments") setCommentsLoading(true);
              setActiveSubTab("comments");
            }}
            aria-pressed={activeSubTab === "comments"}
            className="rounded-xl px-4 font-bold"
          >
            <MessageSquare aria-hidden="true" />
            <span>Thảo luận ({total})</span>
          </Button>
        </div>
      </Card>

      {/* Sub-tab 1: Reviews List */}
      {activeSubTab === "reviews" && (
        <div className="space-y-4">
          <StoryRatingForm key={storyId} storySlug={storySlug} />
          {reviews.length > 0 ? (
            reviews.map((rev) => (
              <Card
                key={rev.idDanhGia}
                className="rounded-2xl"
              >
                <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs">
                      {rev.authorName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold sm:text-sm">
                        {rev.authorName}
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        {rev.createdAt}
                      </p>
                    </div>
                  </div>

                  {/* Stars */}
                  <div className="flex items-center gap-0.5 text-warning">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-3.5 h-3.5 ${
                          s <= rev.soSao ? "fill-warning text-warning" : "text-muted-foreground/30"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  {rev.noiDung || "Độc giả không để lại lời bình chi tiết."}
                </p>
                </CardContent>
              </Card>
            ))
          ) : (
            <EmptyState><EmptyStateIcon><Star aria-hidden="true" /></EmptyStateIcon><EmptyStateTitle>Chưa có bài đánh giá</EmptyStateTitle><EmptyStateDescription>Hãy là độc giả đầu tiên chia sẻ cảm nhận về tác phẩm.</EmptyStateDescription></EmptyState>
          )}
        </div>
      )}

      {/* Sub-tab 2: Comments & Discussion */}
      {activeSubTab === "comments" && (
        <div className="space-y-6">
          {/* Post Comment Input */}
          {requiresLogin ? (
            <Alert variant="info"><AlertDescription>
              <Link
                href={`/dang-nhap?redirect=${encodeURIComponent(returnPath)}`}
                className="font-semibold underline underline-offset-4"
              >
                Đăng nhập
              </Link>{" "}để tham gia thảo luận cùng độc giả.
            </AlertDescription></Alert>
          ) : (
          <form onSubmit={handlePostComment} className="space-y-3">
            <label htmlFor={`story-comment-${storyId}`} className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Bình luận của bạn
            </label>
            <div>
              <Textarea
                id={`story-comment-${storyId}`}
                name="noiDung"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                maxLength={1000}
                disabled={posting}
                rows={3}
                placeholder="Chia sẻ cảm nhận của bạn về tác phẩm…"
                aria-describedby={`comment-limit-${storyId}`}
                aria-invalid={postError ? true : undefined}
                className="min-h-24 resize-y rounded-2xl p-4 text-xs sm:text-sm"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span id={`comment-limit-${storyId}`} className="text-xs tabular-nums text-muted-foreground">{commentText.length}/1.000 ký tự</span>
              <Button
                type="submit"
                size="sm"
                disabled={posting || !commentText.trim()}
                className="rounded-xl font-bold"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                {posting ? "Đang gửi…" : "Gửi bình luận"}
              </Button>
            </div>
            {postError && <Alert variant="destructive"><AlertDescription>{postError}</AlertDescription></Alert>}
          </form>
          )}

          {/* Comments List */}
          <div className="space-y-3" aria-busy={commentsLoading}>
            {commentsLoading ? (
              <p role="status" className="py-8 text-center text-sm text-muted-foreground">Đang tải bình luận…</p>
            ) : commentsError ? (
              <ErrorState><div><ErrorStateTitle>Không thể tải bình luận</ErrorStateTitle><ErrorStateDescription>{commentsError}</ErrorStateDescription><ErrorStateActions><Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCommentsLoading(true);
                    setCommentsError(null);
                    setRefreshVersion((previous) => previous + 1);
                  }}
                >
                  Thử lại
                </Button></ErrorStateActions></div></ErrorState>
            ) : commentList.length === 0 ? (
              <EmptyState><EmptyStateIcon><MessageSquare aria-hidden="true" /></EmptyStateIcon><EmptyStateTitle>Chưa có bình luận</EmptyStateTitle><EmptyStateDescription>Hãy chia sẻ cảm nhận đầu tiên về tác phẩm.</EmptyStateDescription></EmptyState>
            ) : commentList.map((comm) => (
              <Card
                key={comm.idBinhLuan}
                className="rounded-2xl"
              >
                <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-xs">
                      {comm.authorName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold">
                        {comm.authorName}
                        {comm.isStoryAuthor && <Badge variant="warning" className="ml-2 rounded text-[10px]">Tác giả</Badge>}
                      </h4>
                      <p className="text-[10px] text-muted-foreground">
                        {comm.createdAt}
                      </p>
                    </div>
                  </div>

                  <span
                    className="flex items-center gap-1 text-[11px] text-muted-foreground"
                    aria-label={`${comm.likeCount} lượt thích`}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{comm.likeCount}</span>
                  </span>
                </div>

                <p className="whitespace-pre-wrap break-words pl-10 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  {comm.noiDung}
                </p>
                <StoryCommentReplies storySlug={storySlug} parentId={comm.idBinhLuan} />
                </CardContent>
              </Card>
            ))}
          </div>
          {!commentsLoading && !commentsError && totalPage > 1 && (
            <Pagination aria-label="Phân trang bình luận"><PaginationContent>
              <PaginationItem><Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Trang bình luận trước"
                disabled={page <= 1 || posting}
                onClick={() => changePage(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button></PaginationItem>
              <PaginationItem><span className="px-2 text-sm tabular-nums" aria-live="polite">Trang {page}/{totalPage}</span></PaginationItem>
              <PaginationItem><Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Trang bình luận sau"
                disabled={page >= totalPage || posting}
                onClick={() => changePage(page + 1)}
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button></PaginationItem>
            </PaginationContent></Pagination>
          )}
        </div>
      )}
    </div>
  );
}
