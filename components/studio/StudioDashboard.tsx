"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Coins, Eye, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { EmptyState, EmptyStateActions, EmptyStateDescription, EmptyStateIcon, EmptyStateTitle } from "@/components/shared/empty-state";
import { ErrorState, ErrorStateActions, ErrorStateDescription, ErrorStateTitle } from "@/components/shared/error-state";
import { FormActions } from "@/components/shared/form-actions";
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from "@/components/shared/page-header";

type Story = { idTruyen: number; tenTruyen: string; slug: string; anhBia: string; moTa?: string | null; trang_thai?: string | null; soChuong?: number | null; luotXem?: number | null };
type Dashboard = { stories: Story[]; stats: { stories: number; publishedChapters: number; views: number; revenue: number }; pagination: { page: number; totalPages: number; total: number } };
type StoryForm = { tenTruyen: string; moTa: string; anhBia: string; trang_thai: string };
const emptyStory: StoryForm = { tenTruyen: "", moTa: "", anhBia: "", trang_thai: "dang_tien_hanh" };

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
    <PageHeader><PageHeaderContent><PageHeaderEyebrow>Không gian của tác giả</PageHeaderEyebrow><PageHeaderTitle>Câu chuyện tiếp theo bắt đầu từ bạn.</PageHeaderTitle><PageHeaderDescription>Viết, nhập bản thảo và kết nối với độc giả trong một không gian.</PageHeaderDescription></PageHeaderContent><PageHeaderActions><Button onClick={() => { setEditing("new"); setForm(emptyStory); setError(""); }}><Plus aria-hidden="true" />Tạo truyện sáng tác mới</Button></PageHeaderActions></PageHeader>
    <section aria-label="Thống kê sáng tác" className="grid grid-cols-2 gap-3 lg:grid-cols-4">{stats.map(item => <Card key={item.label} className="py-0"><CardContent className="p-4 sm:p-5"><item.icon aria-hidden="true" className="mb-4 size-5 text-primary" /><p className="text-2xl font-bold tabular-nums">{item.value.toLocaleString("vi-VN")}</p><p className="mt-1 text-xs text-muted-foreground">{item.label}</p></CardContent></Card>)}</section>
    {notice ? <Alert variant="success" role="status"><AlertTitle>Đã cập nhật</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}
    {editing !== null ? <Card><CardHeader><CardTitle>{editing === "new" ? "Tạo truyện sáng tác" : "Thông tin truyện"}</CardTitle><CardDescription>Ảnh bìa runtime phải được lưu trên Cloudinary và dùng URL HTTPS.</CardDescription></CardHeader><CardContent><form onSubmit={event => void saveStory(event)} className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1.5 text-sm font-medium sm:col-span-2">Tên truyện<Input name="tenTruyen" required maxLength={255} autoComplete="off" value={form.tenTruyen} onChange={event => setForm(current => ({ ...current, tenTruyen: event.target.value }))} placeholder="Tên câu chuyện của bạn…" /></label>
      <label className="space-y-1.5 text-sm font-medium">Ảnh bìa Cloudinary<Input name="anhBia" type="url" maxLength={2000} value={form.anhBia} onChange={event => setForm(current => ({ ...current, anhBia: event.target.value }))} placeholder="https://res.cloudinary.com/…" /></label>
      <label className="space-y-1.5 text-sm font-medium">Trạng thái<Select value={form.trang_thai} onValueChange={value => setForm(current => ({ ...current, trang_thai: value }))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="dang_tien_hanh">Đang sáng tác</SelectItem><SelectItem value="hoan_thanh">Hoàn thành</SelectItem><SelectItem value="tam_dung">Tạm dừng</SelectItem><SelectItem value="sap_ra_mat">Sắp ra mắt</SelectItem></SelectContent></Select></label>
      <label className="space-y-1.5 text-sm font-medium sm:col-span-2">Giới thiệu / Văn án<Textarea name="moTa" maxLength={100000} rows={5} value={form.moTa} onChange={event => setForm(current => ({ ...current, moTa: event.target.value }))} placeholder="Giới thiệu thế giới và nhân vật trong truyện…" /></label>
      <FormActions className="sm:col-span-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>Hủy</Button><Button disabled={busy}>{busy ? "Đang lưu…" : "Lưu truyện"}</Button></FormActions>
    </form></CardContent></Card> : null}
    {error ? <ErrorState><ErrorStateTitle>Không thể hoàn tất thao tác</ErrorStateTitle><ErrorStateDescription>{error}</ErrorStateDescription><ErrorStateActions><Button type="button" variant="outline" onClick={() => setRevision(current => current + 1)}>Thử lại</Button></ErrorStateActions></ErrorState> : null}
    <section className="space-y-4"><h2 className="text-xl font-semibold">Truyện của tôi</h2>{loading ? <p role="status" className="py-8 text-muted-foreground">Đang tải truyện sáng tác…</p> : data?.stories.length ? <div className="grid gap-4 md:grid-cols-2">{data.stories.map(story => <Card key={story.idTruyen} className="min-w-0"><CardHeader className="grid-cols-[1fr_auto] items-start"><CardTitle className="break-words text-lg">{story.tenTruyen}</CardTitle><Badge variant={story.trang_thai === "hoan_thanh" ? "success" : story.trang_thai === "tam_dung" ? "warning" : "info"}>{story.trang_thai === "hoan_thanh" ? "Hoàn thành" : story.trang_thai === "tam_dung" ? "Tạm dừng" : "Đang sáng tác"}</Badge><CardDescription className="col-span-2 tabular-nums">{story.soChuong ?? 0} chương công khai · {(story.luotXem ?? 0).toLocaleString("vi-VN")} lượt đọc</CardDescription></CardHeader><CardFooter className="flex-wrap"><Button asChild size="sm"><Link href={`/studio/stories/${story.idTruyen}/chapters`}>Viết & quản lý chương</Link></Button><Button type="button" size="sm" variant="outline" onClick={() => { setEditing(story.idTruyen); setForm({ tenTruyen: story.tenTruyen, moTa: story.moTa ?? "", anhBia: story.anhBia, trang_thai: story.trang_thai ?? "dang_tien_hanh" }); }}>Chỉnh sửa</Button><Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => void deleteStory(story)}>Ẩn truyện</Button><Button asChild size="sm" variant="ghost"><Link href={`/truyen/${story.slug}`}>Trang đọc</Link></Button></CardFooter></Card>)}</div> : !error ? <EmptyState><EmptyStateIcon><BookOpen /></EmptyStateIcon><EmptyStateTitle>Bạn chưa có truyện sáng tác</EmptyStateTitle><EmptyStateDescription>Tạo truyện mới, rồi viết hoặc nhập các chương từ bản thảo.</EmptyStateDescription><EmptyStateActions><Button onClick={() => { setEditing("new"); setForm(emptyStory); }}>Tạo truyện đầu tiên</Button></EmptyStateActions></EmptyState> : null}
    {data && data.pagination.totalPages > 1 ? <Pagination><PaginationContent><PaginationItem><Button variant="outline" disabled={loading || page <= 1} onClick={() => setPage(current => current - 1)}>Trước</Button></PaginationItem><PaginationItem><span className="px-2 text-sm tabular-nums">{page} / {data.pagination.totalPages}</span></PaginationItem><PaginationItem><Button variant="outline" disabled={loading || page >= data.pagination.totalPages} onClick={() => setPage(current => current + 1)}>Sau</Button></PaginationItem></PaginationContent></Pagination> : null}</section>
  </div>;
}

