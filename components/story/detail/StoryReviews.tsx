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
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/80 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="text-4xl sm:text-5xl font-black text-slate-900 dark:text-white">
            {averageRating.toFixed(1)}
          </div>
          <div>
            <div className="flex items-center gap-1 text-amber-400">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`w-5 h-5 ${
                    s <= Math.round(averageRating)
                      ? "fill-amber-400 text-amber-400"
                      : "text-slate-300 dark:text-zinc-700"
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1 font-medium">
              Dựa trên {totalRatings} lượt đánh giá từ độc giả
            </p>
          </div>
        </div>

        {/* Sub-tabs switcher */}
        <div className="flex items-center gap-2 bg-white dark:bg-zinc-800 p-1 rounded-2xl border border-slate-200 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => setActiveSubTab("reviews")}
            aria-pressed={activeSubTab === "reviews"}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer ${
              activeSubTab === "reviews"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Star className="w-3.5 h-3.5" />
            <span>Đánh giá ({totalRatings})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (activeSubTab !== "comments") setCommentsLoading(true);
              setActiveSubTab("comments");
            }}
            aria-pressed={activeSubTab === "comments"}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer ${
              activeSubTab === "comments"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Thảo luận ({total})</span>
          </button>
        </div>
      </div>

      {/* Sub-tab 1: Reviews List */}
      {activeSubTab === "reviews" && (
        <div className="space-y-4">
          <StoryRatingForm key={storyId} storySlug={storySlug} />
          {reviews.length > 0 ? (
            reviews.map((rev) => (
              <div
                key={rev.idDanhGia}
                className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800/80 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs">
                      {rev.authorName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100">
                        {rev.authorName}
                      </h4>
                      <p className="text-[11px] text-slate-400 dark:text-zinc-500">
                        {rev.createdAt}
                      </p>
                    </div>
                  </div>

                  {/* Stars */}
                  <div className="flex items-center gap-0.5 text-amber-400">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-3.5 h-3.5 ${
                          s <= rev.soSao ? "fill-amber-400 text-amber-400" : "text-slate-200"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-slate-700 dark:text-zinc-300 leading-relaxed">
                  {rev.noiDung || "Độc giả không để lại lời bình chi tiết."}
                </p>
              </div>
            ))
          ) : (
            <div className="py-12 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/80 dark:border-zinc-800">
              <Star className="w-8 h-8 text-slate-300 dark:text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Chưa có bài đánh giá nào.</p>
            </div>
          )}
        </div>
      )}

      {/* Sub-tab 2: Comments & Discussion */}
      {activeSubTab === "comments" && (
        <div className="space-y-6">
          {/* Post Comment Input */}
          {requiresLogin ? (
            <p className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-slate-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-slate-200">
              <Link
                href={`/dang-nhap?redirect=${encodeURIComponent(returnPath)}`}
                className="font-semibold text-blue-600 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400"
              >
                Đăng nhập
              </Link>{" "}để tham gia thảo luận cùng độc giả.
            </p>
          ) : (
          <form onSubmit={handlePostComment} className="space-y-3">
            <label htmlFor={`story-comment-${storyId}`} className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Bình luận của bạn
            </label>
            <div>
              <textarea
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
                className="w-full p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-y disabled:opacity-60"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span id={`comment-limit-${storyId}`} className="text-xs text-slate-500 tabular-nums dark:text-zinc-400">{commentText.length}/1.000 ký tự</span>
              <button
                type="submit"
                disabled={posting || !commentText.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 cursor-pointer disabled:cursor-not-allowed"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                {posting ? "Đang gửi…" : "Gửi bình luận"}
              </button>
            </div>
            {postError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{postError}</p>}
          </form>
          )}

          {/* Comments List */}
          <div className="space-y-3" aria-busy={commentsLoading}>
            {commentsLoading ? (
              <p role="status" className="py-8 text-center text-sm text-slate-500">Đang tải bình luận…</p>
            ) : commentsError ? (
              <div className="rounded-xl border border-red-200 p-4 text-center dark:border-red-900">
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">{commentsError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setCommentsLoading(true);
                    setCommentsError(null);
                    setRefreshVersion((previous) => previous + 1);
                  }}
                  className="mt-3 rounded-md border px-4 py-2 text-sm font-semibold hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-zinc-800"
                >
                  Thử lại
                </button>
              </div>
            ) : commentList.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500 dark:text-zinc-400">Chưa có bình luận nào. Hãy chia sẻ cảm nhận đầu tiên.</p>
            ) : commentList.map((comm) => (
              <div
                key={comm.idBinhLuan}
                className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800/80 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-xs">
                      {comm.authorName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                        {comm.authorName}
                        {comm.isStoryAuthor && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">Tác giả</span>}
                      </h4>
                      <p className="text-[10px] text-slate-400 dark:text-zinc-500">
                        {comm.createdAt}
                      </p>
                    </div>
                  </div>

                  <span
                    className="flex items-center gap-1 text-[11px] text-slate-400"
                    aria-label={`${comm.likeCount} lượt thích`}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{comm.likeCount}</span>
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-slate-700 dark:text-zinc-300 leading-relaxed pl-10 whitespace-pre-wrap break-words">
                  {comm.noiDung}
                </p>
                <StoryCommentReplies storySlug={storySlug} parentId={comm.idBinhLuan} />
              </div>
            ))}
          </div>
          {!commentsLoading && !commentsError && totalPage > 1 && (
            <nav aria-label="Phân trang bình luận" className="flex items-center justify-center gap-3">
              <button
                type="button"
                aria-label="Trang bình luận trước"
                disabled={page <= 1 || posting}
                onClick={() => changePage(page - 1)}
                className="rounded-md border p-2 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-zinc-800"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="text-sm tabular-nums" aria-live="polite">Trang {page}/{totalPage}</span>
              <button
                type="button"
                aria-label="Trang bình luận sau"
                disabled={page >= totalPage || posting}
                onClick={() => changePage(page + 1)}
                className="rounded-md border p-2 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-zinc-800"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
