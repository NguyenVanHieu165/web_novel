"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { z } from "zod";

import { useAuth } from "@/context/AuthContext";

const ratingResponseSchema = z.object({
  success: z.literal(true),
  average: z.number().min(0).max(5),
  total: z.number().int().nonnegative(),
  rating: z.object({ stars: z.number().int().min(1).max(5), content: z.string() }).nullable(),
});
const errorResponseSchema = z.object({ message: z.string() });
type RatingResponse = z.infer<typeof ratingResponseSchema>;
type RatingDraft = { accountId: number | null; stars: number; content: string; snapshot: RatingResponse };

export default function StoryRatingForm({ storySlug }: { storySlug: string }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const accountId = user?.idTaiKhoan ?? null;
  const [draft, setDraft] = useState<RatingDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expired, setExpired] = useState(false);
  const inFlight = useRef(false);
  const endpoint = `/api/truyen/${encodeURIComponent(storySlug)}/rating`;
  const loadedDraft = draft?.accountId === accountId ? draft : null;

  useEffect(() => {
    if (authLoading) return;
    const controller = new AbortController();
    fetch(endpoint, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const parsed = ratingResponseSchema.safeParse(await response.json());
        if (!response.ok || !parsed.success) throw new Error("Không thể tải đánh giá của bạn. Vui lòng thử lại.");
        if (controller.signal.aborted) return;
        setDraft({ accountId, stars: parsed.data.rating?.stars ?? 0, content: parsed.data.rating?.content ?? "", snapshot: parsed.data });
        setLoadError(null);
        setExpired(false);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Không thể tải đánh giá.");
      });
    return () => controller.abort();
  }, [endpoint, accountId, authLoading, reloadVersion]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loadedDraft || loadedDraft.stars === 0 || inFlight.current || !user) return;
    inFlight.current = true;
    setPending(true);
    setPostError(null);
    setSaved(false);
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stars: loadedDraft.stars, content: loadedDraft.content.trim() }),
      });
      const payload: unknown = await response.json();
      const parsed = ratingResponseSchema.safeParse(payload);
      if (!response.ok || !parsed.success) {
        if (response.status === 401) setExpired(true);
        const error = errorResponseSchema.safeParse(payload);
        throw new Error(error.success ? error.data.message : "Không thể lưu đánh giá. Vui lòng thử lại.");
      }
      setDraft({ accountId, stars: parsed.data.rating?.stars ?? loadedDraft.stars, content: parsed.data.rating?.content ?? "", snapshot: parsed.data });
      setSaved(true);
      router.refresh();
    } catch (error) {
      setPostError(error instanceof Error ? error.message : "Không thể lưu đánh giá. Vui lòng thử lại.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  if (authLoading) return <p role="status" className="text-sm text-slate-500">Đang tải đánh giá…</p>;
  if (!user || expired) {
    return (
      <p className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-slate-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-slate-200">
        <Link href={`/dang-nhap?redirect=${encodeURIComponent(`/truyen/${storySlug}`)}`} className="font-semibold text-blue-600 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400">Đăng nhập</Link>{" "}
        để đánh giá tác phẩm. Mỗi tài khoản có thể cập nhật một đánh giá.
      </p>
    );
  }
  if (loadError) {
    return (
      <div className="rounded-xl border border-red-200 p-4 dark:border-red-900">
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
        <button type="button" onClick={() => { setLoadError(null); setReloadVersion((version) => version + 1); }} className="mt-3 rounded-md border px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Thử lại</button>
      </div>
    );
  }
  if (!loadedDraft) return <p role="status" className="text-sm text-slate-500">Đang tải đánh giá…</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <fieldset disabled={pending} className="space-y-3">
        <legend className="text-sm font-bold text-slate-900 dark:text-zinc-100">Đánh giá của bạn</legend>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((stars) => (
            <label key={stars} className="cursor-pointer">
              <input
                type="radio" name="stars" value={stars} required
                checked={loadedDraft.stars === stars}
                onChange={() => {
                  setDraft({ ...loadedDraft, stars });
                  setSaved(false);
                }}
                aria-label={`${stars} sao`}
                className="peer sr-only"
              />
              <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 transition-colors hover:bg-amber-50 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-checked:border-amber-400 peer-checked:bg-amber-50 dark:border-zinc-700 dark:hover:bg-amber-950/30 dark:peer-checked:bg-amber-950/30">
                <Star aria-hidden="true" className={`h-6 w-6 ${loadedDraft.stars >= stars ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-zinc-600"}`} />
              </span>
            </label>
          ))}
        </div>
        <label htmlFor={`rating-content-${storySlug}`} className="block text-sm font-medium text-slate-700 dark:text-zinc-300">Lời đánh giá (không bắt buộc)</label>
        <textarea
          id={`rating-content-${storySlug}`} name="content" rows={3} maxLength={2000}
          value={loadedDraft.content}
          onChange={(event) => {
            setDraft({ ...loadedDraft, content: event.target.value });
            setSaved(false);
          }}
          placeholder="Bạn thích điều gì ở tác phẩm này?…"
          className="w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs tabular-nums text-slate-500">{loadedDraft.content.length}/2.000 ký tự</span>
          <button type="submit" disabled={loadedDraft.stars === 0} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
            {pending ? "Đang lưu…" : loadedDraft.snapshot.rating ? "Cập nhật đánh giá" : "Gửi đánh giá"}
          </button>
        </div>
      </fieldset>
      {postError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{postError}</p>}
      {saved && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">Đã lưu đánh giá. Trung bình {loadedDraft.snapshot.average.toLocaleString("vi-VN")} / 5 từ {loadedDraft.snapshot.total.toLocaleString("vi-VN")} lượt đánh giá.</p>}
    </form>
  );
}
