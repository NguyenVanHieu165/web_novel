"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, PenLine, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { EmptyState, EmptyStateDescription, EmptyStateTitle } from "@/components/shared/empty-state";
import { ErrorState, ErrorStateActions, ErrorStateDescription, ErrorStateTitle } from "@/components/shared/error-state";
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/shared/page-header";
import StoryChapterEditor from "@/components/chapters/StoryChapterEditor";
import { emptyWritingChapter, type WritingChapter } from "@/components/chapters/chapter-editor-state";

type Chapter = { idChuong: number; idTruyen?: number; chuongSo: string | number; tieuDeChuong: string; slug: string; isFree: boolean | null; giaXu: number | null; isDeleted: boolean | null; noiDungChuong?: { noiDung?: string | null } | null };
type Listing = { story: { idTruyen: number; tenTruyen: string }; chapters: Chapter[]; pagination: { page: number; totalPages: number; total: number }; nextNumber: number };
const nextNumberUrl = (storyId: number) => `/api/studio/stories/${storyId}/chapters/next-number`;
const importUrl = (storyId: number) => `/api/studio/stories/${storyId}/chapters/import-doc`;

export default function StudioChapters({ storyId, accountId }: { storyId: number; accountId: number }) {
  const [data, setData] = useState<Listing | null>(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<Chapter | null>(null);
  const [newRevision, setNewRevision] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingChapter, setLoadingChapter] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/studio/stories/${storyId}/chapters?page=${page}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const body: { success?: boolean; message?: string; data?: Listing } = await response.json();
      if (!response.ok || !body.success || !body.data) throw new Error(body.message || "Không thể tải danh sách chương.");
      if (!controller.signal.aborted) setData(body.data);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Không thể tải chương."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [storyId, page, revision]);
  async function editChapter(chapterId: number) {
    if (loadingChapter) return;
    if (!window.confirm("Mở chương khác? Các thay đổi chưa lưu được giữ trong bản nháp trên thiết bị sau mỗi 3 giây.")) return;
    setLoadingChapter(true); setError("");
    try {
      const response = await fetch(`/api/studio/stories/${storyId}/chapters?chapterId=${chapterId}`, { cache: "no-store" });
      const body: { success?: boolean; message?: string; data?: { chapter: Chapter } } = await response.json();
      if (!response.ok || !body.success || !body.data?.chapter) throw new Error(body.message || "Không thể mở nội dung chương.");
      setSelected(body.data.chapter);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể mở chương."); }
    finally { setLoadingChapter(false); }
  }
  async function save(value: WritingChapter, writeNext: boolean) {
    const response = await fetch(`/api/studio/stories/${storyId}/chapters`, { method: value.idChuong ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
    const body: { success?: boolean; message?: string; data?: Chapter | { chapter?: Chapter } } = await response.json();
    if (!response.ok || !body.success) throw new Error(body.message || "Không thể lưu chương.");
    setRevision(current => current + 1);
    if (!writeNext && body.data) {
      const chapter = "chapter" in body.data ? body.data.chapter : "idChuong" in body.data ? body.data : undefined;
      if (chapter) setSelected({ ...chapter, noiDungChuong: { noiDung: value.noiDung } });
    }
  }
  const initial = selected ? { idChuong: selected.idChuong, idTruyen: storyId, chuongSo: Number(selected.chuongSo), tieuDeChuong: selected.tieuDeChuong, slug: selected.slug, noiDung: selected.noiDungChuong?.noiDung ?? "", isFree: selected.isFree ?? true, giaXu: selected.giaXu ?? 0, publication: selected.isDeleted ? "draft" as const : "published" as const } : emptyWritingChapter(storyId, data?.nextNumber ?? 1);
  return <div className="space-y-6">
    <PageHeader><PageHeaderContent><Button asChild variant="ghost" size="sm" className="-ml-2 w-fit"><Link href="/studio"><ArrowLeft aria-hidden="true" />Truyện của tôi</Link></Button><PageHeaderTitle className="break-words">{data?.story.tenTruyen ?? "Quản lý chương sáng tác"}</PageHeaderTitle><PageHeaderDescription>Viết bản nháp, nhập bản thảo và xuất bản khi bạn đã sẵn sàng.</PageHeaderDescription></PageHeaderContent></PageHeader>
    {error ? <ErrorState><ErrorStateTitle>Không thể tải không gian viết</ErrorStateTitle><ErrorStateDescription>{error}</ErrorStateDescription><ErrorStateActions><Button type="button" variant="outline" onClick={() => setRevision(current => current + 1)}>Thử lại</Button></ErrorStateActions></ErrorState> : null}
    {!data ? loading ? <p role="status">Đang tải không gian viết…</p> : null : <div className="grid items-start gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside><Card><CardHeader className="grid-cols-[1fr_auto] items-center"><CardTitle>Mục lục của tôi</CardTitle><Badge variant="secondary" className="tabular-nums">{data.pagination.total} chương</Badge></CardHeader><CardContent className="space-y-4"><Button className="w-full" variant="outline" onClick={() => { if (window.confirm("Mở trang viết chương mới? Hãy lưu chương hiện tại trước khi chuyển.")) { setSelected(null); setNewRevision(current => current + 1); } }}><Plus aria-hidden="true" />Viết chương mới</Button>
        {loading ? <p role="status" className="text-xs text-muted-foreground">Đang tải mục lục…</p> : null}
        {loadingChapter ? <p role="status" className="text-xs text-muted-foreground">Đang mở chương…</p> : null}
        {data.chapters.length ? <ol className="max-h-[560px] space-y-1 overflow-auto">{data.chapters.map(chapter => <li key={chapter.idChuong}><Button type="button" variant={selected?.idChuong === chapter.idChuong ? "secondary" : "ghost"} disabled={loadingChapter} onClick={() => void editChapter(chapter.idChuong)} aria-current={selected?.idChuong === chapter.idChuong ? "true" : undefined} className="h-auto w-full justify-start whitespace-normal p-3 text-left"><span className="min-w-0"><span className="line-clamp-2 break-words"><PenLine aria-hidden="true" className="mr-1 inline size-3" />{chapter.chuongSo}. {chapter.tieuDeChuong}</span><span className="mt-1 block text-xs text-muted-foreground">{chapter.isDeleted ? "Bản nháp" : "Công khai"} · {chapter.isFree ? "Miễn phí" : `${chapter.giaXu ?? 0} xu`}</span></span></Button></li>)}</ol> : <EmptyState className="min-h-36"><EmptyStateTitle>Chưa có chương</EmptyStateTitle><EmptyStateDescription>Bắt đầu viết hoặc nhập nội dung từ bản thảo.</EmptyStateDescription></EmptyState>}
        {data.pagination.totalPages > 1 ? <Pagination><PaginationContent><PaginationItem><Button size="sm" variant="outline" disabled={loading || page <= 1} onClick={() => setPage(current => current - 1)}>Trước</Button></PaginationItem><PaginationItem><span className="px-1 text-xs tabular-nums">{page}/{data.pagination.totalPages}</span></PaginationItem><PaginationItem><Button size="sm" variant="outline" disabled={loading || page >= data.pagination.totalPages} onClick={() => setPage(current => current + 1)}>Sau</Button></PaginationItem></PaginationContent></Pagination> : null}
      </CardContent></Card></aside>
      <div className="min-w-0"><StoryChapterEditor key={selected?.idChuong ?? `new-${newRevision}`} accountId={accountId} stories={[data.story]} initial={initial} nextNumberUrl={nextNumberUrl} importUrl={importUrl} onSave={save} onImported={() => setRevision(current => current + 1)} /></div>
    </div>}
  </div>;
}

