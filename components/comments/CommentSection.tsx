"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Heart, MessageCircle, Send, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

type Comment = { idBinhLuan: number; noiDung: string; likeCount: number; createdAt: string; authorName: string; isAuthor: boolean; isAdmin: boolean; isLiked: boolean; isOwn: boolean; chapterNumber: number | null };
type ApiPage = { success: true; data: Comment[]; meta: { total: number } };
type Props = { storySlug: string; chapterId?: number; className?: string };

export default function CommentSection({ storySlug, chapterId, className = "" }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replies, setReplies] = useState<Record<number, Comment[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const endpoint = `/api/truyen/${encodeURIComponent(storySlug)}/comments${chapterId ? `?chapterId=${chapterId}` : ""}`;
  const redirect = chapterId ? `/truyen/${storySlug}` : `/truyen/${storySlug}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data: unknown = await response.json();
      if (!response.ok || !data || typeof data !== "object" || !("success" in data) || data.success !== true) throw new Error("Không thể tải bình luận.");
      setComments((data as ApiPage).data);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể tải bình luận."); }
    finally { setLoading(false); }
  }, [endpoint]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!text.trim()) return;
    const response = await fetch(`/api/truyen/${encodeURIComponent(storySlug)}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ noiDung: text, chapterId, replyTo: replyTo ?? undefined }) });
    if (!response.ok) { setError("Không thể đăng bình luận."); return; }
    setText(""); setReplyTo(null); await load();
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
    if (response.ok && data && typeof data === "object" && "success" in data && data.success === true) setReplies(current => ({ ...current, [id]: (data as ApiPage).data }));
    setReplyTo(id);
  };
  const remove = async (id: number) => { if ((await fetch(`/api/comments/${id}`, { method: "DELETE" })).ok) setComments(items => items.filter(item => item.idBinhLuan !== id)); };

  return <section className={`space-y-4 ${className}`} aria-label="Bình luận">
    <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Bình luận</h2><span className="text-sm text-muted-foreground">{comments.length} thảo luận</span></div>
    {user ? <form onSubmit={submit} className="space-y-2"><textarea value={text} onChange={event => setText(event.target.value)} maxLength={1000} rows={3} placeholder={replyTo ? "Viết phản hồi..." : "Viết bình luận..."} className="w-full rounded-lg border bg-background p-3 text-sm" />
      <div className="flex justify-between"><button type="button" onClick={() => setReplyTo(null)} className="text-sm text-muted-foreground">{replyTo ? "Hủy trả lời" : ""}</button><button className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Send className="h-4 w-4" /> Gửi</button></div></form> : <p className="rounded-lg border p-3 text-sm"><Link href={`/dang-nhap?redirect=${encodeURIComponent(redirect)}`} className="font-semibold underline">Đăng nhập</Link> để tham gia bình luận.</p>}
    {loading ? <p className="text-sm text-muted-foreground">Đang tải bình luận...</p> : error ? <p role="alert" className="text-sm text-red-600">{error}</p> : comments.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có bình luận nào.</p> : <div className="space-y-3">{comments.map(comment => <article key={comment.idBinhLuan} className="rounded-lg border p-3"><div className="flex items-center gap-2 text-sm font-semibold"><span>{comment.authorName}</span>{comment.isAuthor ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">Tác giả</span> : null}{comment.isAdmin ? <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800">Admin</span> : null}{!chapterId && comment.chapterNumber !== null ? <span className="rounded bg-muted px-1.5 py-0.5 text-xs">Chương {comment.chapterNumber}</span> : null}</div><p className="mt-2 whitespace-pre-wrap text-sm">{comment.noiDung}</p><div className="mt-3 flex gap-3 text-xs"><button type="button" onClick={() => void toggleLike(comment.idBinhLuan)} className={comment.isLiked ? "font-semibold text-red-600" : ""}><Heart className="mr-1 inline h-3.5 w-3.5" />Thích {comment.likeCount}</button><button type="button" onClick={() => void showReplies(comment.idBinhLuan)}><MessageCircle className="mr-1 inline h-3.5 w-3.5" />Trả lời</button>{comment.isOwn || user?.roles.includes("admin") ? <button type="button" onClick={() => void remove(comment.idBinhLuan)}><Trash2 className="mr-1 inline h-3.5 w-3.5" />Xóa</button> : null}</div>{replies[comment.idBinhLuan]?.map(reply => <div key={reply.idBinhLuan} className="mt-3 ml-4 border-l pl-3 text-sm"><span className="font-semibold">{reply.authorName}</span><p className="mt-1 whitespace-pre-wrap">{reply.noiDung}</p></div>)}</article>)}</div>}
  </section>;
}
