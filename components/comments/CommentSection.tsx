"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import Link from "next/link";
import { Heart, MessageCircle, Send, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type CommentId = number | string;
type Comment = { idBinhLuan: CommentId; noiDung: string; likeCount: number; createdAt: string; authorName: string; authorAvatar?: string | null; isAuthor: boolean; isAdmin: boolean; isLiked: boolean; isOwn: boolean; chapterNumber: number | null; isPending?: boolean };
type CreatedComment = { success: true; data: Comment };
type Props = { storySlug: string; chapterId?: number; redirectPath?: string; className?: string };
const commentSchema = z.object({
  idBinhLuan: z.number().int().positive(), noiDung: z.string(), likeCount: z.number(), createdAt: z.string(), authorName: z.string(),
  authorAvatar: z.string().nullable().optional(), isAuthor: z.boolean(), isAdmin: z.boolean(), isLiked: z.boolean(), isOwn: z.boolean(), chapterNumber: z.number().nullable(),
});
const pageSchema = z.object({ success: z.literal(true), data: z.array(commentSchema), meta: z.object({ page: z.number().int().positive(), total: z.number().int().nonnegative(), totalPage: z.number().int().positive() }) });
type Thread = { items: Comment[]; page: number; total: number; totalPage: number; loading: boolean; error: string; requestedPage: number };
const emptyThread = (): Thread => ({ items: [], page: 0, total: 0, totalPage: 1, loading: false, error: "", requestedPage: 1 });
const mergeComments = (current: Comment[], incoming: Comment[]) => Array.from(new Map([...current, ...incoming].map(item => [item.idBinhLuan, item])).values());

function isCreatedComment(value: unknown): value is CreatedComment {
  return Boolean(value && typeof value === "object" && "success" in value && value.success === true && "data" in value && commentSchema.safeParse(value.data).success);
}

export default function CommentSection({ storySlug, chapterId, redirectPath, className = "" }: Props) {
  const { user } = useAuth();
  return <CommentThreads key={`${storySlug}:${chapterId ?? "story"}:${user?.idTaiKhoan ?? "guest"}`} storySlug={storySlug} chapterId={chapterId} redirectPath={redirectPath} className={className} />;
}

function CommentThreads({ storySlug, chapterId, redirectPath, className = "" }: Props) {
  const { user } = useAuth();
  const [threads, setThreads] = useState<Record<string, Thread>>({ root: { ...emptyThread(), loading: true } });
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(true);
  const requests = useRef(new Map<string, AbortController>());
  const posting = useRef(false);
  const root = threads.root;
  const comments = root.items;
  const endpoint = `/api/truyen/${encodeURIComponent(storySlug)}/comments${chapterId ? `?chapterId=${chapterId}` : ""}`;
  const redirect = redirectPath ?? `/truyen/${encodeURIComponent(storySlug)}`;

  const loadPage = useCallback(async (parentId: number | null, page: number) => {
    const key = parentId === null ? "root" : String(parentId);
    if (requests.current.has(key)) return;
    const controller = new AbortController();
    requests.current.set(key, controller);
    setThreads(current => ({ ...current, [key]: { ...(current[key] ?? emptyThread()), loading: true, error: "", requestedPage: page } }));
    try {
      const query = new URLSearchParams({ page: String(page), limit: "15" });
      if (parentId !== null) query.set("replyTo", String(parentId));
      const response = await fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}${query}`, { cache: "no-store", signal: controller.signal });
      const data = pageSchema.safeParse(await response.json());
      if (!response.ok || !data.success) throw new Error("Không thể tải bình luận. Hãy thử lại.");
      if (!active.current || controller.signal.aborted) return;
      setThreads(current => {
        const previous = current[key] ?? emptyThread();
        return { ...current, [key]: { ...previous, items: mergeComments(previous.items, data.data.data), ...data.data.meta, loading: false, error: "" } };
      });
    } catch (cause) {
      if (active.current && !controller.signal.aborted) setThreads(current => ({ ...current, [key]: { ...(current[key] ?? emptyThread()), loading: false, error: cause instanceof Error ? cause.message : "Không thể tải bình luận." } }));
    } finally { if (requests.current.get(key) === controller) requests.current.delete(key); }
  }, [endpoint]);
  useEffect(() => {
    active.current = true;
    const controllers = requests.current;
    const timer = window.setTimeout(() => { void loadPage(null, 1); }, 0);
    return () => { active.current = false; window.clearTimeout(timer); for (const controller of controllers.values()) controller.abort(); controllers.clear(); };
  }, [loadPage]);
  const updateItems = (parentId: number | null, update: (items: Comment[]) => Comment[]) => {
    const key = parentId === null ? "root" : String(parentId);
    setThreads(current => { const previous = current[key] ?? emptyThread(); return { ...current, [key]: { ...previous, items: update(previous.items) } }; });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const content = text.trim();
    if (posting.current || !user || !content) return;
    const parentId = replyTo;
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: Comment = {
      idBinhLuan: tempId,
      noiDung: content,
      likeCount: 0,
      createdAt: "Vừa xong",
      authorName: user.hoTen || user.tenTaiKhoan,
      authorAvatar: user.anh ?? null,
      isAuthor: false,
      isAdmin: user.roles.includes("admin"),
      isLiked: false,
      isOwn: true,
      chapterNumber: null,
      isPending: true,
    };

    posting.current = true;
    setSubmitting(true);
    setError("");
    setText("");
    setReplyTo(null);
    updateItems(parentId, current => [optimistic, ...current]);

    try {
      const response = await fetch(`/api/truyen/${encodeURIComponent(storySlug)}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ noiDung: content, chapterId, replyTo: parentId ?? undefined }) });
      const payload: unknown = await response.json();
      if (!active.current) return;
      if (!response.ok || !isCreatedComment(payload)) throw new Error(payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string" ? payload.message : "Không thể đăng bình luận.");
      updateItems(parentId, current => mergeComments([], current.map(item => item.idBinhLuan === tempId ? payload.data : item)));
    } catch (cause) {
      if (!active.current) return;
      updateItems(parentId, current => current.filter(item => item.idBinhLuan !== tempId));
      setText(content);
      setReplyTo(parentId);
      setError(cause instanceof Error ? cause.message : "Không thể đăng bình luận.");
    } finally { posting.current = false; if (active.current) setSubmitting(false); }
  };
  const toggleLike = async (id: number) => {
    const response = await fetch(`/api/comments/${id}/like`, { method: "POST" });
    const data: unknown = await response.json();
    if (!response.ok || !data || typeof data !== "object" || !("isLiked" in data) || !("likeCount" in data)) return;
    if (active.current) updateItems(null, items => items.map(item => item.idBinhLuan === id ? { ...item, isLiked: Boolean(data.isLiked), likeCount: Number(data.likeCount) } : item));
  };
  const showReplies = async (id: number) => {
    setReplyTo(id);
    if (!threads[id]?.page) await loadPage(id, 1);
  };
  const remove = async (id: number) => { if ((await fetch(`/api/comments/${id}`, { method: "DELETE" })).ok && active.current) updateItems(null, items => items.filter(item => item.idBinhLuan !== id)); };

  return <section className={`space-y-4 ${className}`} aria-label="Bình luận">
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">Bình luận</h2><Badge variant="outline">{comments.length} thảo luận</Badge></div>
    {user ? <form onSubmit={submit} className="space-y-2">
      <label className="sr-only" htmlFor="chapter-comment-content">Nội dung bình luận</label>
      <Textarea id="chapter-comment-content" name="comment" value={text} onChange={event => setText(event.target.value)} maxLength={1000} rows={3} placeholder={replyTo ? "Viết phản hồi…" : "Viết bình luận…"} />
      <div className="flex justify-between gap-3">{replyTo ? <Button type="button" variant="ghost" onClick={() => setReplyTo(null)}>Hủy trả lời</Button> : <span />}<Button type="submit" disabled={submitting || !text.trim()}><Send aria-hidden="true" />{submitting ? "Đang gửi…" : "Gửi"}</Button></div>
    </form> : <Alert><AlertDescription><Link href={`/dang-nhap?redirect=${encodeURIComponent(redirect)}`} className="font-semibold underline underline-offset-4">Đăng nhập</Link> để tham gia bình luận.</AlertDescription></Alert>}
    {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
    {root.loading && comments.length === 0 ? <p role="status" className="text-sm text-muted-foreground">Đang tải bình luận…</p> : comments.length === 0 && !root.error ? <p className="text-sm text-muted-foreground">Chưa có bình luận nào.</p> : <div className="space-y-3">{comments.map(comment => {
      const pending = comment.isPending === true;
      const id = typeof comment.idBinhLuan === "number" ? comment.idBinhLuan : null;
      return <Card key={comment.idBinhLuan} className="gap-0 bg-[var(--reader-paper,var(--card))] p-3 py-3 text-[var(--reader-text,var(--card-foreground))]"><article>
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span>{comment.authorName}</span>{comment.isAuthor ? <Badge variant="warning">Tác giả</Badge> : null}{comment.isAdmin ? <Badge variant="info">Admin</Badge> : null}{!chapterId && comment.chapterNumber !== null ? <Badge variant="secondary">Chương {comment.chapterNumber}</Badge> : null}{pending ? <Badge variant="secondary">Đang gửi…</Badge> : null}</div>
        <p className="mt-2 whitespace-pre-wrap text-sm">{comment.noiDung}</p>
        <div className="mt-3 flex flex-wrap gap-1"><Button type="button" variant="ghost" size="sm" disabled={pending || id === null} onClick={() => id !== null && void toggleLike(id)} aria-label={`${comment.isLiked ? "Bỏ thích" : "Thích"} bình luận của ${comment.authorName}`} className={comment.isLiked ? "text-destructive hover:text-destructive" : ""}><Heart aria-hidden="true" />Thích {comment.likeCount}</Button><Button type="button" variant="ghost" size="sm" disabled={pending || id === null} onClick={() => id !== null && void showReplies(id)} aria-label={`Trả lời bình luận của ${comment.authorName}`}><MessageCircle aria-hidden="true" />Trả lời</Button>{(comment.isOwn || user?.roles.includes("admin")) ? <Button type="button" variant="destructive" size="sm" disabled={pending || id === null} onClick={() => id !== null && void remove(id)} aria-label={`Xóa bình luận của ${comment.authorName}`}><Trash2 aria-hidden="true" />Xóa</Button> : null}</div>
        {id !== null && threads[id]?.items.map(reply => <div key={reply.idBinhLuan} className="mt-3 ml-4 border-l pl-3 text-sm"><span className="font-semibold">{reply.authorName}</span>{reply.isPending ? <Badge variant="secondary" className="ml-2">Đang gửi…</Badge> : null}<p className="mt-1 whitespace-pre-wrap">{reply.noiDung}</p></div>)}
        {id !== null && threads[id] && <div className="mt-3 ml-4 space-y-2" aria-busy={threads[id].loading}>
          {threads[id].loading && <p role="status" className="text-sm text-muted-foreground">Đang tải phản hồi…</p>}
          {threads[id].error ? <Alert variant="destructive" role="alert"><AlertDescription>{threads[id].error}</AlertDescription><Button type="button" variant="outline" size="sm" onClick={() => void loadPage(id, threads[id].requestedPage)}>Thử tải lại phản hồi</Button></Alert> : threads[id].page < threads[id].totalPage && threads[id].page > 0 && <Button type="button" variant="outline" size="sm" disabled={threads[id].loading} onClick={() => void loadPage(id, threads[id].page + 1)}>Xem thêm phản hồi</Button>}
        </div>}
      </article></Card>;
    })}</div>}
    {root.error ? <Alert variant="destructive" role="alert"><AlertDescription>{root.error}</AlertDescription><Button type="button" variant="outline" onClick={() => void loadPage(null, root.requestedPage)}>Thử tải lại bình luận</Button></Alert> : root.page > 0 && root.page < root.totalPage && <Button type="button" variant="outline" disabled={root.loading} onClick={() => void loadPage(null, root.page + 1)}>{root.loading ? "Đang tải bình luận…" : "Xem thêm bình luận"}</Button>}
  </section>;
}
