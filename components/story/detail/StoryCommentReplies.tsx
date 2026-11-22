"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import type { CommentItemData } from "@/lib/mappers/story-detail.mapper";
import { commentErrorSchema, commentsPageSchema, createdCommentSchema } from "./comment-response";

export default function StoryCommentReplies({ storySlug, parentId }: { storySlug: string; parentId: number }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [items, setItems] = useState<CommentItemData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [expired, setExpired] = useState(false);
  const [revision, setRevision] = useState(0);
  const submitting = useRef(false);
  const endpoint = `/api/truyen/${encodeURIComponent(storySlug)}/comments`;
  const panelId = `comment-replies-${parentId}`;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`${endpoint}?replyTo=${parentId}&page=${page}&limit=10`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const result = commentsPageSchema.safeParse(await response.json());
        if (!response.ok || !result.success) throw new Error("Không thể tải phản hồi. Hãy thử lại.");
        if (controller.signal.aborted) return;
        setItems(result.data.data);
        setTotalPages(result.data.meta.totalPage);
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Không thể tải phản hồi."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, open, page, parentId, revision]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || !user || expired || !text.trim()) return;
    submitting.current = true;
    setPosting(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noiDung: text.trim(), replyTo: parentId }) });
      const payload: unknown = await response.json();
      if (!response.ok || !createdCommentSchema.safeParse(payload).success) {
        if (response.status === 401) setExpired(true);
        const failure = commentErrorSchema.safeParse(payload);
        throw new Error(failure.success ? failure.data.message : "Không thể gửi phản hồi.");
      }
      setText("");
      setPage(1);
      setLoading(true);
      setRevision(value => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể gửi phản hồi.");
    } finally { submitting.current = false; setPosting(false); }
  }

  function changePage(value: number) { setPage(value); setLoading(true); setError(null); }

  return <div className="pl-10 text-xs">
    <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => {
      if (!open) { setLoading(true); setError(null); }
      setOpen(value => !value);
    }} className="rounded px-2 py-1 font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300 dark:hover:bg-zinc-800">
      {open ? "Ẩn phản hồi" : "Xem / viết phản hồi"}
    </button>
    {open && <section id={panelId} aria-label="Phản hồi bình luận" className="mt-2 space-y-3 border-l-2 border-slate-200 pl-3 dark:border-zinc-700">
      <div aria-busy={loading} className="space-y-3">
        {loading ? <p role="status">Đang tải phản hồi…</p> : items.length ? items.map(item => <article key={item.idBinhLuan}>
          <p className="font-semibold text-slate-900 dark:text-slate-100">{item.authorName}
            {item.isStoryAuthor && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-200">Tác giả</span>}
            <span className="ml-2 font-normal text-slate-500">{item.createdAt}</span>
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed">{item.noiDung}</p>
        </article>) : <p className="text-slate-500">Chưa có phản hồi.</p>}
      </div>
      {error && <div><p role="alert" className="text-red-600 dark:text-red-400">{error}</p>
        <button type="button" onClick={() => { setError(null); setLoading(true); setRevision(value => value + 1); }} className="mt-1 rounded px-2 py-1 underline focus-visible:ring-2 focus-visible:ring-blue-500">Tải lại phản hồi</button></div>}
      {totalPages > 1 && <nav aria-label="Phân trang phản hồi" className="flex items-center gap-3">
        <button type="button" disabled={page <= 1 || loading} onClick={() => changePage(page - 1)} className="rounded px-2 py-1 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40">Trước</button>
        <span className="tabular-nums">{page}/{totalPages}</span>
        <button type="button" disabled={page >= totalPages || loading} onClick={() => changePage(page + 1)} className="rounded px-2 py-1 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40">Sau</button>
      </nav>}
      {user && !expired ? <form onSubmit={submit} className="space-y-2">
        <label htmlFor={`reply-text-${parentId}`} className="block font-semibold">Viết phản hồi</label>
        <textarea id={`reply-text-${parentId}`} name="noiDung" rows={2} maxLength={1000} value={text} onChange={event => setText(event.target.value)} disabled={posting}
          className="w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-slate-100" />
        <div className="flex items-center justify-between gap-2"><span className="text-slate-500 tabular-nums">{text.length}/1.000 ký tự</span>
          <button type="submit" disabled={posting || !text.trim()} className="rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50">{posting ? "Đang gửi…" : "Gửi phản hồi"}</button>
        </div>
      </form> : <Link href={`/dang-nhap?redirect=${encodeURIComponent(`/truyen/${storySlug}`)}`} className="inline-block rounded py-2 font-semibold text-blue-700 underline focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300">Đăng nhập để phản hồi</Link>}
    </section>}
  </div>;
}
