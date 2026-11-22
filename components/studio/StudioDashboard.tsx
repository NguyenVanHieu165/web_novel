"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Coins, Eye, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type Story = { idTruyen: number; tenTruyen: string; slug: string; anhBia: string; moTa?: string | null; trang_thai?: string | null; soChuong?: number | null; luotXem?: number | null };
type Dashboard = { stories: Story[]; stats: { stories: number; publishedChapters: number; views: number; revenue: number }; pagination: { page: number; totalPages: number; total: number } };
type StoryForm = { tenTruyen: string; moTa: string; anhBia: string; trang_thai: string };
const emptyStory: StoryForm = { tenTruyen: "", moTa: "", anhBia: "", trang_thai: "dang_tien_hanh" };
const fieldClass = "block w-full rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-zinc-700";

export default function StudioDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<StoryForm>(emptyStory);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/studio/stories?page=${page}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const body: { success?: boolean; data?: Dashboard; message?: string } = await response.json();
      if (!response.ok || !body.success || !body.data) throw new Error(body.message || "Không thể tải khu vực sáng tác.");
      if (!controller.signal.aborted) setData(body.data);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Không thể tải truyện."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, revision]);
  async function saveStory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(editing === "new" ? "/api/studio/stories" : `/api/studio/stories/${editing}`, { method: editing === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body: { success?: boolean; message?: string } = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || "Không thể lưu truyện.");
      setNotice(editing === "new" ? "Đã tạo truyện sáng tác. Hãy mở Viết & quản lý chương để bắt đầu." : "Đã cập nhật truyện.");
      setEditing(null); setForm(emptyStory); setRevision(current => current + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu truyện."); }
    finally { setBusy(false); }
  }
  async function deleteStory(story: Story) {
    if (!window.confirm(`Ẩn truyện “${story.tenTruyen}” khỏi trang đọc? Nội dung và lịch sử mua vẫn được giữ.`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/studio/stories/${story.idTruyen}`, { method: "DELETE" });
      const body: { success?: boolean; message?: string } = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || "Không thể ẩn truyện.");
      setNotice("Đã ẩn truyện."); setRevision(current => current + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể ẩn truyện."); }
    finally { setBusy(false); }
  }
  const stats = [
    { label: "Truyện sáng tác", value: data?.stats.stories ?? 0, icon: BookOpen },
    { label: "Chương đã đăng", value: data?.stats.publishedChapters ?? 0, icon: FileText },
    { label: "Lượt đọc", value: data?.stats.views ?? 0, icon: Eye },
    { label: "Doanh thu sáng tác (xu)", value: data?.stats.revenue ?? 0, icon: Coins },
  ];
  return <div className="space-y-7">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-sky-600 dark:text-sky-400">Không gian của tác giả</p><h1 className="text-3xl font-bold tracking-tight">Câu chuyện tiếp theo bắt đầu từ bạn.</h1><p className="mt-3 text-sm text-slate-500 dark:text-zinc-400">Viết, nhập bản thảo và kết nối với độc giả trong một không gian.</p></div><Button onClick={() => { setEditing("new"); setForm(emptyStory); setError(""); }}><Plus aria-hidden className="size-4" />Tạo truyện sáng tác mới</Button></header>
    <section aria-label="Thống kê sáng tác" className="grid grid-cols-2 gap-3 lg:grid-cols-4">{stats.map(item => <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-5"><item.icon aria-hidden className="mb-4 size-5 text-sky-600 dark:text-sky-400" /><p className="text-2xl font-bold tabular-nums">{item.value.toLocaleString("vi-VN")}</p><p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">{item.label}</p></div>)}</section>
    {notice ? <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">{notice}</p> : null}
    {editing !== null ? <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><h2 className="mb-4 text-xl font-semibold">{editing === "new" ? "Tạo truyện sáng tác" : "Thông tin truyện"}</h2><form onSubmit={event => void saveStory(event)} className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1 text-sm sm:col-span-2">Tên truyện<input name="tenTruyen" required maxLength={255} autoComplete="off" value={form.tenTruyen} onChange={event => setForm(current => ({ ...current, tenTruyen: event.target.value }))} className={fieldClass} placeholder="Tên câu chuyện của bạn…" /></label>
      <label className="space-y-1 text-sm">Ảnh bìa (URL hoặc đường dẫn tải lên)<input name="anhBia" maxLength={2000} value={form.anhBia} onChange={event => setForm(current => ({ ...current, anhBia: event.target.value }))} className={fieldClass} placeholder="https://… hoặc /uploads/covers/…" /></label>
      <label className="space-y-1 text-sm">Trạng thái<select name="trang_thai" value={form.trang_thai} onChange={event => setForm(current => ({ ...current, trang_thai: event.target.value }))} className={fieldClass}><option value="dang_tien_hanh">Đang sáng tác</option><option value="hoan_thanh">Hoàn thành</option><option value="tam_dung">Tạm dừng</option><option value="sap_ra_mat">Sắp ra mắt</option></select></label>
      <label className="space-y-1 text-sm sm:col-span-2">Giới thiệu / Văn án<textarea name="moTa" maxLength={100000} rows={5} value={form.moTa} onChange={event => setForm(current => ({ ...current, moTa: event.target.value }))} className={fieldClass} placeholder="Giới thiệu thế giới và nhân vật trong truyện…" /></label>
      <div className="flex gap-2 sm:col-span-2"><Button disabled={busy}>{busy ? "Đang lưu…" : "Lưu truyện"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>Hủy</Button></div>
    </form></section> : null}
    {error ? <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error} <button type="button" className="ml-2 underline" onClick={() => setRevision(current => current + 1)}>Thử lại</button></p> : null}
    <section className="space-y-4"><h2 className="text-xl font-semibold">Truyện của tôi</h2>{loading ? <p role="status" className="py-8 text-slate-500">Đang tải truyện sáng tác…</p> : data?.stories.length ? <div className="grid gap-4 md:grid-cols-2">{data.stories.map(story => <article key={story.idTruyen} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><div className="mb-4 flex items-start justify-between gap-3"><h3 className="break-words text-lg font-semibold">{story.tenTruyen}</h3><span className="shrink-0 rounded-full bg-sky-500/10 px-2 py-1 text-xs text-sky-700 dark:text-sky-300">{story.trang_thai === "hoan_thanh" ? "Hoàn thành" : story.trang_thai === "tam_dung" ? "Tạm dừng" : "Đang sáng tác"}</span></div><p className="mb-5 text-xs tabular-nums text-slate-500 dark:text-zinc-400">{story.soChuong ?? 0} chương công khai · {(story.luotXem ?? 0).toLocaleString("vi-VN")} lượt đọc</p><div className="flex flex-wrap items-center gap-3 text-sm"><Link href={`/studio/stories/${story.idTruyen}/chapters`} className="rounded-lg bg-slate-900 px-3 py-2 font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 dark:bg-sky-600">Viết & quản lý chương</Link><button type="button" className="rounded px-1 py-2 text-sky-700 focus-visible:outline-2 dark:text-sky-400" onClick={() => { setEditing(story.idTruyen); setForm({ tenTruyen: story.tenTruyen, moTa: story.moTa ?? "", anhBia: story.anhBia, trang_thai: story.trang_thai ?? "dang_tien_hanh" }); }}>Chỉnh sửa</button><button type="button" disabled={busy} className="rounded px-1 py-2 text-red-600 focus-visible:outline-2 dark:text-red-400" onClick={() => void deleteStory(story)}>Ẩn truyện</button><Link href={`/truyen/${story.slug}`} className="rounded px-1 py-2 text-slate-500 focus-visible:outline-2">Trang đọc</Link></div></article>)}</div> : !error ? <div className="rounded-2xl border border-dashed p-10 text-center"><BookOpen aria-hidden className="mx-auto mb-3 size-9 text-slate-400" /><h3 className="font-semibold">Bạn chưa có truyện sáng tác</h3><p className="mt-2 text-sm text-slate-500">Tạo truyện mới, rồi viết hoặc nhập các chương từ bản thảo.</p></div> : null}
    {data && data.pagination.totalPages > 1 ? <nav aria-label="Phân trang truyện sáng tác" className="flex items-center justify-center gap-4"><Button variant="outline" disabled={loading || page <= 1} onClick={() => setPage(current => current - 1)}>Trước</Button><span className="text-sm tabular-nums">{page} / {data.pagination.totalPages}</span><Button variant="outline" disabled={loading || page >= data.pagination.totalPages} onClick={() => setPage(current => current + 1)}>Sau</Button></nav> : null}</section>
  </div>;
}

