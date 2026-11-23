"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { z } from "zod";

import { useAuth } from "@/context/AuthContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { FormActions } from "@/components/shared/form-actions";
import { ErrorState, ErrorStateActions, ErrorStateDescription, ErrorStateTitle } from "@/components/shared/error-state";

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

  if (authLoading) return <p role="status" className="text-sm text-muted-foreground">Đang tải đánh giá…</p>;
  if (!user || expired) {
    return (
      <Alert variant="info"><AlertDescription>
        <Link href={`/dang-nhap?redirect=${encodeURIComponent(`/truyen/${storySlug}`)}`} className="font-semibold underline underline-offset-4">Đăng nhập</Link>{" "}
        để đánh giá tác phẩm. Mỗi tài khoản có thể cập nhật một đánh giá.
      </AlertDescription></Alert>
    );
  }
  if (loadError) {
    return (
      <ErrorState><div><ErrorStateTitle>Không thể tải đánh giá</ErrorStateTitle><ErrorStateDescription>{loadError}</ErrorStateDescription><ErrorStateActions><Button type="button" variant="outline" onClick={() => { setLoadError(null); setReloadVersion((version) => version + 1); }}>Thử lại</Button></ErrorStateActions></div></ErrorState>
    );
  }
  if (!loadedDraft) return <p role="status" className="text-sm text-muted-foreground">Đang tải đánh giá…</p>;

  return (
    <Card><CardContent><form onSubmit={handleSubmit} className="space-y-4">
      <fieldset disabled={pending} className="space-y-3">
        <legend className="text-sm font-bold">Đánh giá của bạn</legend>
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
              <span className="flex size-11 items-center justify-center rounded-lg border transition-colors hover:bg-warning/10 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-checked:border-warning peer-checked:bg-warning/10">
                <Star aria-hidden="true" className={`size-6 ${loadedDraft.stars >= stars ? "fill-warning text-warning" : "text-muted-foreground/40"}`} />
              </span>
            </label>
          ))}
        </div>
        <label htmlFor={`rating-content-${storySlug}`} className="block text-sm font-medium">Lời đánh giá (không bắt buộc)</label>
        <Textarea
          id={`rating-content-${storySlug}`} name="content" rows={3} maxLength={2000}
          value={loadedDraft.content}
          onChange={(event) => {
            setDraft({ ...loadedDraft, content: event.target.value });
            setSaved(false);
          }}
          placeholder="Bạn thích điều gì ở tác phẩm này?…"
          className="min-h-24 resize-y rounded-xl"
        />
        <FormActions className="justify-between sm:justify-between">
          <span className="text-xs tabular-nums text-muted-foreground">{loadedDraft.content.length}/2.000 ký tự</span>
          <Button type="submit" disabled={loadedDraft.stars === 0}>
            {pending ? "Đang lưu…" : loadedDraft.snapshot.rating ? "Cập nhật đánh giá" : "Gửi đánh giá"}
          </Button>
        </FormActions>
      </fieldset>
      {postError && <Alert variant="destructive"><AlertDescription>{postError}</AlertDescription></Alert>}
      {saved && <Alert variant="success"><AlertDescription>Đã lưu đánh giá. Trung bình {loadedDraft.snapshot.average.toLocaleString("vi-VN")} / 5 từ {loadedDraft.snapshot.total.toLocaleString("vi-VN")} lượt đánh giá.</AlertDescription></Alert>}
    </form></CardContent></Card>
  );
}
