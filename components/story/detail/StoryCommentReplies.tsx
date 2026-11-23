"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import type { CommentItemData } from "@/lib/mappers/story-detail.mapper";
import { commentErrorSchema, commentsPageSchema, createdCommentSchema } from "./comment-response";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
    <Button type="button" variant="ghost" size="xs" aria-expanded={open} aria-controls={panelId} onClick={() => {
      if (!open) { setLoading(true); setError(null); }
      setOpen(value => !value);
    }} className="font-semibold text-primary">
      {open ? "Ẩn phản hồi" : "Xem / viết phản hồi"}
    </Button>
    {open && <section id={panelId} aria-label="Phản hồi bình luận" className="mt-2 space-y-3 border-l-2 pl-3">
      <div aria-busy={loading} className="space-y-3">
        {loading ? <p role="status">Đang tải phản hồi…</p> : items.length ? items.map(item => <article key={item.idBinhLuan}>
          <p className="font-semibold">{item.authorName}
            {item.isStoryAuthor && <Badge variant="warning" className="ml-2 rounded text-[10px]">Tác giả</Badge>}
            <span className="ml-2 font-normal text-muted-foreground">{item.createdAt}</span>
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed">{item.noiDung}</p>
        </article>) : <p className="text-muted-foreground">Chưa có phản hồi.</p>}
      </div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription><Button type="button" variant="outline" size="xs" className="mt-2" onClick={() => { setError(null); setLoading(true); setRevision(value => value + 1); }}>Tải lại phản hồi</Button></Alert>}
      {totalPages > 1 && <nav aria-label="Phân trang phản hồi" className="flex items-center gap-3">
        <Button type="button" variant="outline" size="xs" disabled={page <= 1 || loading} onClick={() => changePage(page - 1)}>Trước</Button>
        <span className="tabular-nums">{page}/{totalPages}</span>
        <Button type="button" variant="outline" size="xs" disabled={page >= totalPages || loading} onClick={() => changePage(page + 1)}>Sau</Button>
      </nav>}
      {user && !expired ? <form onSubmit={submit} className="space-y-2">
        <label htmlFor={`reply-text-${parentId}`} className="block font-semibold">Viết phản hồi</label>
        <Textarea id={`reply-text-${parentId}`} name="noiDung" rows={2} maxLength={1000} value={text} onChange={event => setText(event.target.value)} disabled={posting} />
        <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground tabular-nums">{text.length}/1.000 ký tự</span>
          <Button type="submit" size="sm" disabled={posting || !text.trim()}>{posting ? "Đang gửi…" : "Gửi phản hồi"}</Button>
        </div>
      </form> : <Button asChild variant="link" size="sm"><Link href={`/dang-nhap?redirect=${encodeURIComponent(`/truyen/${storySlug}`)}`}>Đăng nhập để phản hồi</Link></Button>}
    </section>}
  </div>;
}
