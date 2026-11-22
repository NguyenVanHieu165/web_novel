"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  Star,
  BookOpen,
  Eye,
  Heart,
  Share2,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import StoryBadge from "@/components/story/StoryBadge";
import { StoryDetailData } from "@/lib/mappers/story-detail.mapper";
import { gsap, useGSAP } from "@/lib/gsap";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

interface StoryDetailHeaderProps {
  story: StoryDetailData;
}

const followResponseSchema = z.object({
  success: z.literal(true),
  following: z.boolean(),
  total: z.number().int().nonnegative(),
});

interface FollowState {
  slug: string;
  accountId: number | null;
  following: boolean;
  total: number;
}

export default function StoryDetailHeader({ story }: StoryDetailHeaderProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const coverCardRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const [followState, setFollowState] = useState<FollowState | null>(null);
  const [followPending, setFollowPending] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);
  const followRequest = useRef(false);
  const followVersion = useRef(0);
  const accountId = user?.idTaiKhoan ?? null;
  const matchingFollowState = followState?.slug === story.slug && followState.accountId === accountId;
  const isFollowing = matchingFollowState ? followState.following : false;
  const followCount = matchingFollowState ? followState.total : story.luotTheoDoi;
  const followReady = accountId === null || matchingFollowState;

  useEffect(() => {
    if (authLoading) return;
    const controller = new AbortController();
    const version = ++followVersion.current;
    fetch(`/api/truyen/${encodeURIComponent(story.slug)}/follow`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Không thể tải trạng thái theo dõi. Vui lòng thử lại.");
        const data = followResponseSchema.parse(await response.json());
        if (!controller.signal.aborted && version === followVersion.current) {
          setFollowState({ slug: story.slug, accountId, following: data.following, total: data.total });
          setFollowError(null);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && version === followVersion.current) setFollowError("Không thể tải trạng thái theo dõi. Bạn có thể thử lại.");
      });
    return () => controller.abort();
  }, [story.slug, accountId, authLoading]);

  useGSAP(() => {
    const cover = coverCardRef.current;
    const glare = glareRef.current;
    if (!cover || !glare) return;
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)", () => {
      gsap.set(cover, { transformPerspective: 1000 });
      const rotateX = gsap.quickTo(cover, "rotationX", { duration: 0.35, ease: "power2.out" });
      const rotateY = gsap.quickTo(cover, "rotationY", { duration: 0.35, ease: "power2.out" });
      const glareOpacity = gsap.quickTo(glare, "opacity", { duration: 0.25, ease: "power2.out" });
      const move = (event: PointerEvent) => {
        const rect = cover.getBoundingClientRect();
        rotateY(((event.clientX - rect.left) / rect.width - 0.5) * 12);
        rotateX(-((event.clientY - rect.top) / rect.height - 0.5) * 12);
        glareOpacity(0.65);
      };
      const leave = () => {
        rotateX(0);
        rotateY(0);
        glareOpacity(0);
      };
      cover.addEventListener("pointermove", move);
      cover.addEventListener("pointerleave", leave);
      return () => {
        cover.removeEventListener("pointermove", move);
        cover.removeEventListener("pointerleave", leave);
      };
    });
    return () => media.revert();
  }, { scope: coverCardRef });

  const handleToggleFollow = async () => {
    if (followRequest.current || authLoading) return;
    if (!user) {
      router.push(`/dang-nhap?redirect=${encodeURIComponent(`/truyen/${story.slug}`)}`);
      return;
    }
    followRequest.current = true;
    const version = ++followVersion.current;
    setFollowPending(true);
    setFollowError(null);
    try {
      // If the initial status failed to load, read it again before choosing the desired state.
      let currentFollowing = isFollowing;
      if (!matchingFollowState) {
        const currentResponse = await fetch(`/api/truyen/${encodeURIComponent(story.slug)}/follow`, { cache: "no-store" });
        if (!currentResponse.ok) throw new Error("Không thể tải trạng thái theo dõi");
        currentFollowing = followResponseSchema.parse(await currentResponse.json()).following;
      }
      const response = await fetch(`/api/truyen/${encodeURIComponent(story.slug)}/follow`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ following: !currentFollowing }),
      });
      if (response.status === 401) {
        router.push(`/dang-nhap?redirect=${encodeURIComponent(`/truyen/${story.slug}`)}`);
        return;
      }
      if (!response.ok) throw new Error("Không thể cập nhật theo dõi. Vui lòng thử lại.");
      const data = followResponseSchema.parse(await response.json());
      if (version !== followVersion.current) return;
      setFollowState({ slug: story.slug, accountId, following: data.following, total: data.total });
      toast.success(data.following ? "Đã theo dõi truyện." : "Đã bỏ theo dõi truyện.");
    } catch (error) {
      if (version !== followVersion.current) return;
      const message = error instanceof Error ? error.message : "Không thể cập nhật theo dõi. Vui lòng thử lại.";
      setFollowError(message);
      toast.error(message);
    } finally {
      followRequest.current = false;
      setFollowPending(false);
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Đã sao chép liên kết truyện vào bộ nhớ tạm!");
    } catch {
      toast.error("Không thể sao chép liên kết. Bạn có thể sao chép từ thanh địa chỉ.");
    }
  };

  return (
    <div className="relative w-full overflow-hidden rounded-3xl bg-white dark:bg-zinc-900/90 border border-slate-200/80 dark:border-zinc-800 shadow-xl shadow-slate-900/5 dark:shadow-black/20 p-6 sm:p-8 md:p-10 mb-8">
      {/* 1. Ambient Backdrop Glow lan tỏa màu sắc theo ảnh bìa */}
      <div
        className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-25 blur-[120px] transition-all duration-1000 -z-10"
        style={{
          backgroundImage: `url(${story.anhBia})`,
          backgroundSize: "cover",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-24 -right-24 w-96 h-96 rounded-full opacity-20 blur-[120px] transition-all duration-1000 -z-10 bg-blue-500"
      />

      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-zinc-500 mb-6 flex-wrap">
        <Link href="/" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
          Trang chủ
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-zinc-600" />
        {story.genres.length > 0 && (
          <>
            <Link
              href={`/the-loai/${story.genres[0].idTheLoai}`}
              className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              {story.genres[0].tenTheLoai}
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-zinc-600" />
          </>
        )}
        <span className="text-slate-700 dark:text-zinc-300 font-semibold truncate max-w-xs">
          {story.tenTruyen}
        </span>
      </nav>

      {/* Main Header Content */}
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] lg:grid-cols-[300px_1fr] gap-8 lg:gap-10 items-start">
        {/* Cover with 3D Tilt */}
        <div className="flex justify-center md:justify-start">
          <div
            ref={coverCardRef}
            className="relative w-[240px] sm:w-[260px] lg:w-[290px] aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl shadow-blue-900/20 border border-white/20 select-none"
            style={{
              transformStyle: "preserve-3d",
              borderRadius: "1rem",
              WebkitMaskImage: "-webkit-radial-gradient(white, black)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={story.anhBia}
              alt={story.tenTruyen}
              width={290}
              height={435}
              loading="eager"
              decoding="async"
              fetchPriority="high"
              className="w-full h-full object-cover pointer-events-none rounded-2xl"
              style={{ borderRadius: "1rem" }}
            />

            {/* Holo Glare Sheen Overlay */}
            <div
              ref={glareRef}
              className="absolute inset-0 z-30 pointer-events-none opacity-0 rounded-2xl"
              style={{ borderRadius: "1rem", background: "linear-gradient(125deg, rgba(255,255,255,0.4), rgba(96,165,250,0.15) 45%, transparent 75%)" }}
            />

            {/* Badge overlay */}
            <div className="absolute top-3 right-3 z-20" style={{ transform: "translateZ(25px)" }}>
              <StoryBadge
                variant={
                  story.trang_thai === "hoan_thanh"
                    ? "full"
                    : story.luotXem > 1000
                    ? "hot"
                    : "dang-ra"
                }
              />
            </div>
          </div>
        </div>

        {/* Story Info */}
        <div className="space-y-5 flex flex-col justify-between h-full">
          <div>
            {/* Title & Tag */}
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                {story.tenTruyen}
              </h1>

              {/* Genres Pills */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                {story.genres.map((g) => (
                  <Link
                    key={g.idTheLoai}
                    href={`/the-loai/${g.idTheLoai}`}
                    className="px-3 py-1 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-bold rounded-full transition-colors"
                  >
                    {g.tenTheLoai}
                  </Link>
                ))}
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-5 my-5 border-y border-slate-100 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-500 flex items-center justify-center shrink-0">
                  <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                </div>
                <div>
                  <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                    {story.diemDanhGiaTrungBinh}
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-zinc-500">
                    {story.soLuotDanhGia} đánh giá
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-500 flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                    {story.soChuong.toLocaleString("vi-VN")}
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-zinc-500">
                    Số chương
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-500 flex items-center justify-center shrink-0">
                  <Eye className="w-5 h-5 text-violet-500" />
                </div>
                <div>
                  <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                    {story.luotXem.toLocaleString("vi-VN")}
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-zinc-500">
                    Lượt đọc
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-500 flex items-center justify-center shrink-0">
                  <Heart className="w-5 h-5 text-rose-500 fill-rose-500/20" />
                </div>
                <div>
                  <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                    {followCount.toLocaleString("vi-VN")}
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-zinc-500">
                    Theo dõi
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            {story.firstChapterSlug ? (
              <Link
                href={`/truyen/${story.slug}/${story.firstChapterSlug}`}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-500/25 active:scale-95 transition-all duration-200"
              >
                <BookOpen className="w-4 h-4" />
                Đọc từ đầu
              </Link>
            ) : (
              <button
                disabled
                className="px-6 py-3 bg-slate-200 dark:bg-zinc-800 text-slate-400 text-sm font-semibold rounded-xl cursor-not-allowed"
              >
                Chưa có chương
              </button>
            )}

            {story.latestChapterSlug && (
              <Link
                href={`/truyen/${story.slug}/${story.latestChapterSlug}`}
                className="flex items-center gap-2 px-5 py-3 border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-800 dark:text-zinc-200 font-semibold text-sm rounded-xl active:scale-95 transition-all duration-200"
              >
                <Sparkles className="w-4 h-4 text-blue-500" />
                Chương mới nhất
              </Link>
            )}

            <button
              type="button"
              onClick={handleToggleFollow}
              aria-pressed={isFollowing}
              aria-busy={authLoading || followPending || (!followReady && !followError)}
              disabled={authLoading || followPending || (!followReady && !followError)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border font-semibold text-sm transition-colors duration-200 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 motion-reduce:transform-none ${
                isFollowing
                  ? "bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-900/50 text-rose-600 dark:text-rose-400"
                  : "border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300"
              }`}
            >
              <Heart className={`w-4 h-4 ${isFollowing ? "fill-rose-500 text-rose-500" : ""}`} />
              <span>{followPending ? "Đang cập nhật…" : authLoading || (!followReady && !followError) ? "Đang tải…" : isFollowing ? "Đang theo dõi" : "Theo dõi"}</span>
            </button>

            <button
              type="button"
              onClick={handleShare}
              aria-label="Chia sẻ truyện"
              className="p-3 border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 rounded-xl active:scale-95 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 motion-reduce:transform-none"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
          {followError && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{followError}</p>}
        </div>
      </div>
    </div>
  );
}
