"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
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
type ApiPage = { success: true; data: Comment[]; meta: { total: number } };
type CreatedComment = { success: true; data: Comment };
type Props = { storySlug: string; chapterId?: number; redirectPath?: string; className?: string };

function isCreatedComment(value: unknown): value is CreatedComment {
  return Boolean(value && typeof value === "object" && "success" in value && value.success === true && "data" in value);
}

export default function CommentSection({ storySlug, chapterId, redirectPath, className = "" }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replies, setReplies] = useState<Record<number, Comment[]>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const endpoint = `/api/truyen/${encodeURIComponent(storySlug)}/comments${chapterId ? `?chapterId=${chapterId}` : ""}`;
  const redirect = redirectPath ?? `/truyen/${encodeURIComponent(storySlug)}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data: unknown = await response.json();
      if (!response.ok || !data || typeof data !== "object" || !("success" in data) || data.success !== true) throw new Error("Không thể tải bình luận.");
      setComments(current => [...current.filter(item => item.isPending), ...(data as ApiPage).data]);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể tải bình luận."); }
    finally { setLoading(false); }
  }, [endpoint]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const content = text.trim();
    if (submitting || !user || !content) return;
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

    setSubmitting(true);
    setError("");
    setText("");
    setReplyTo(null);
    if (parentId === null) setComments(current => [optimistic, ...current]);
    else setReplies(current => ({ ...current, [parentId]: [optimistic, ...(current[parentId] ?? [])] }));

    try {
      const response = await fetch(`/api/truyen/${encodeURIComponent(storySlug)}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ noiDung: content, chapterId, replyTo: parentId ?? undefined }) });
      const payload: unknown = await response.json();
      if (!response.ok || !isCreatedComment(payload)) throw new Error(payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string" ? payload.message : "Không thể đăng bình luận.");
      if (parentId === null) setComments(current => current.map(item => item.idBinhLuan === tempId ? payload.data : item));
      else setReplies(current => ({ ...current, [parentId]: (current[parentId] ?? []).map(item => item.idBinhLuan === tempId ? payload.data : item) }));
    } catch (cause) {
      if (parentId === null) setComments(current => current.filter(item => item.idBinhLuan !== tempId));
      else setReplies(current => ({ ...current, [parentId]: (current[parentId] ?? []).filter(item => item.idBinhLuan !== tempId) }));
      setText(content);
      setReplyTo(parentId);
      setError(cause instanceof Error ? cause.message : "Không thể đăng bình luận.");
    } finally { setSubmitting(false); }
  };
  const toggleLike = async (id: number) => {
    const response = await fetch(`/api/comments/${id}/like`, { method: "POST" });
    const data: unknown = await response.json();
    if (!response.ok || !data || typeof data !== "object" || !("isLiked" in data) || !("likeCount" in data)) return;
    setComments(items => items.map(item => item.idBinhLuan === id ? { ...item, isLiked: Boolean(data.isLiked), likeCount: Number(data.likeCount) } : item));
  };
  const showReplies = async (id: number) => {
    const separator = endpoint.includes("?") ? "&" : "?";
    const response = await fetch(`${endpoint}${separator}replyTo=${id}`, { cache: "no-store" });
    const data: unknown = await response.json();
    if (response.ok && data && typeof data === "object" && "success" in data && data.success === true) setReplies(current => ({ ...current, [id]: [...(current[id] ?? []).filter(item => item.isPending), ...(data as ApiPage).data] }));
    setReplyTo(id);
  };
  const remove = async (id: number) => { if ((await fetch(`/api/comments/${id}`, { method: "DELETE" })).ok) setComments(items => items.filter(item => item.idBinhLuan !== id)); };

  return <section className={`space-y-4 ${className}`} aria-label="Bình luận">
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">Bình luận</h2><Badge variant="outline">{comments.length} thảo luận</Badge></div>
    {user ? <form onSubmit={submit} className="space-y-2">
      <label className="sr-only" htmlFor="chapter-comment-content">Nội dung bình luận</label>
      <Textarea id="chapter-comment-content" name="comment" value={text} onChange={event => setText(event.target.value)} maxLength={1000} rows={3} placeholder={replyTo ? "Viết phản hồi…" : "Viết bình luận…"} />
      <div className="flex justify-between gap-3">{replyTo ? <Button type="button" variant="ghost" onClick={() => setReplyTo(null)}>Hủy trả lời</Button> : <span />}<Button type="submit" disabled={submitting || !text.trim()}><Send aria-hidden="true" />{submitting ? "Đang gửi…" : "Gửi"}</Button></div>
    </form> : <Alert><AlertDescription><Link href={`/dang-nhap?redirect=${encodeURIComponent(redirect)}`} className="font-semibold underline underline-offset-4">Đăng nhập</Link> để tham gia bình luận.</AlertDescription></Alert>}
    {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
    {loading && comments.length === 0 ? <p role="status" className="text-sm text-muted-foreground">Đang tải bình luận…</p> : comments.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có bình luận nào.</p> : <div className="space-y-3">{comments.map(comment => {
      const pending = comment.isPending === true;
      const id = typeof comment.idBinhLuan === "number" ? comment.idBinhLuan : null;
      return <Card key={comment.idBinhLuan} className="gap-0 bg-[var(--reader-paper,var(--card))] p-3 py-3 text-[var(--reader-text,var(--card-foreground))]"><article>
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span>{comment.authorName}</span>{comment.isAuthor ? <Badge variant="warning">Tác giả</Badge> : null}{comment.isAdmin ? <Badge variant="info">Admin</Badge> : null}{!chapterId && comment.chapterNumber !== null ? <Badge variant="secondary">Chương {comment.chapterNumber}</Badge> : null}{pending ? <Badge variant="secondary">Đang gửi…</Badge> : null}</div>
        <p className="mt-2 whitespace-pre-wrap text-sm">{comment.noiDung}</p>
        <div className="mt-3 flex flex-wrap gap-1"><Button type="button" variant="ghost" size="sm" disabled={pending || id === null} onClick={() => id !== null && void toggleLike(id)} aria-label={`${comment.isLiked ? "Bỏ thích" : "Thích"} bình luận của ${comment.authorName}`} className={comment.isLiked ? "text-destructive hover:text-destructive" : ""}><Heart aria-hidden="true" />Thích {comment.likeCount}</Button><Button type="button" variant="ghost" size="sm" disabled={pending || id === null} onClick={() => id !== null && void showReplies(id)} aria-label={`Trả lời bình luận của ${comment.authorName}`}><MessageCircle aria-hidden="true" />Trả lời</Button>{(comment.isOwn || user?.roles.includes("admin")) ? <Button type="button" variant="destructive" size="sm" disabled={pending || id === null} onClick={() => id !== null && void remove(id)} aria-label={`Xóa bình luận của ${comment.authorName}`}><Trash2 aria-hidden="true" />Xóa</Button> : null}</div>
        {id !== null && replies[id]?.map(reply => <div key={reply.idBinhLuan} className="mt-3 ml-4 border-l pl-3 text-sm"><span className="font-semibold">{reply.authorName}</span>{reply.isPending ? <Badge variant="secondary" className="ml-2">Đang gửi…</Badge> : null}<p className="mt-1 whitespace-pre-wrap">{reply.noiDung}</p></div>)}
      </article></Card>;
    })}</div>}
  </section>;
}
