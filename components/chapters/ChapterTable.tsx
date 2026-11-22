"use client";
import { useState } from "react";
import { Edit2, Trash2, Eye, Copy, GripVertical } from "lucide-react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { useReorderedItems } from "@/hooks/useReorderedItems";
import { Button } from "@/components/ui/button";
import api from "@/lib/axios";
import { toast } from "sonner";
import type { AdminChaptersQuery } from "@/schemas/admin-chapters.schema";
import ChapterPriceSheet from "./ChapterPriceSheet";

export type Chapter = {
  idChuong: number; idTruyen?: number; chuongSo: string | number; tieuDeChuong: string; slug: string;
  isFree?: boolean | null; giaXu?: number | null; wordCount?: number; createdAt?: string | null;
  truyen?: { idTruyen?: number; tenTruyen?: string }; noiDungChuong?: { noiDung?: string | null } | null;
};
type Props = { data: Chapter[]; onEdit: (chapter: Chapter) => void; onPreview: (id: number) => void; refresh: () => void; query: AdminChaptersQuery; onSort: (sort: AdminChaptersQuery["sortBy"]) => void };
const columns: [string, AdminChaptersQuery["sortBy"]][] = [["ID", "id"], ["Truyện", "truyen"], ["Số chương", "soChuong"], ["Tiêu đề", "tieuDe"], ["Giá xu", "giaXu"], ["Độ dài", "wordCount"], ["Ngày tạo", "ngayTao"]];
export default function ChapterTable({ data, onEdit, onPreview, refresh, query, onSort }: Props) {
  const { items, reorder } = useReorderedItems(data);
  const [selected, setSelected] = useState<number[]>([]);
  const [priceOpen, setPriceOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const dragDisabled = query.sortBy !== "soChuong" || query.sortOrder !== "asc";
  const toggle = (id: number) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  async function bulk(action: "set-free" | "delete", chapterIds: number[]) {
    if (busy) return;
    if (action === "delete" && !window.confirm(`Xóa vĩnh viễn ${chapterIds.length} chương, nội dung, bình luận, lịch sử đọc và quyền đã mua liên quan? Thao tác không thể hoàn tác.`)) return;
    setBusy(true);
    try {
      const response = await api.post("/admin/chapters/bulk", { action, chapterIds });
      if (!response.data.success) throw new Error(response.data.message);
      toast.success(`Đã ${action === "delete" ? "xóa" : "chuyển miễn phí"} ${response.data.data.count} chương`); setSelected([]); refresh();
    } catch { toast.error("Không thể cập nhật chương. Hãy tải lại và thử lại."); } finally { setBusy(false); }
  }
  async function deleteOne(id: number) {
    if (busy || !window.confirm("Chuyển chương này vào thùng rác?")) return;
    setBusy(true);
    try {
      const response = await api.delete(`/admin/chapter/${id}`);
      if (!response.data.success) throw new Error("Delete failed");
      toast.success("Đã chuyển chương vào thùng rác"); refresh();
    } catch { toast.error("Không thể xóa chương. Hãy thử lại."); } finally { setBusy(false); }
  }
  const drag = (result: DropResult) => { if (!dragDisabled && result.destination) reorder(result.source.index, result.destination.index); };
  return <div className="space-y-3">
    {selected.length > 0 && <div aria-label="Thao tác chương đã chọn" className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-card-foreground shadow-lg"><strong aria-live="polite" className="mr-2 text-sm">Đã chọn {selected.length} chương</strong><Button disabled={busy} onClick={() => setPriceOpen(true)}>Đặt giá VIP</Button><Button disabled={busy} variant="outline" onClick={() => void bulk("set-free", selected)}>Chuyển miễn phí</Button><Button disabled={busy} variant="destructive" onClick={() => void bulk("delete", selected)}>Xóa hàng loạt</Button><Button disabled={busy} variant="ghost" onClick={() => setSelected([])}>Bỏ chọn</Button></div>}
    <div className="overflow-x-auto rounded-lg border bg-card text-card-foreground"><table className="w-full text-left text-sm"><thead className="bg-muted text-muted-foreground"><tr>
      <th className="p-3"><input type="checkbox" aria-label="Chọn tất cả trên trang" checked={items.length > 0 && selected.length === items.length} ref={(node) => { if (node) node.indeterminate = selected.length > 0 && selected.length < items.length; }} onChange={(event) => setSelected(event.target.checked ? items.map((item) => item.idChuong) : [])} disabled={busy || !items.length} /></th>
      <th className="p-2"><span className="sr-only">Đổi vị trí</span></th>
      {columns.map(([label, key]) => <th key={key} scope="col" aria-sort={query.sortBy === key ? (query.sortOrder === "asc" ? "ascending" : "descending") : "none"} className="whitespace-nowrap p-3"><button type="button" className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onSort(key)}>{label} <span aria-hidden="true">{query.sortBy === key ? (query.sortOrder === "asc" ? "↑" : "↓") : "↕"}</span></button></th>)}
      <th className="p-3">Hành động</th>
    </tr></thead><DragDropContext onDragEnd={drag}><Droppable droppableId="chapters">{(provided) => <tbody ref={provided.innerRef} {...provided.droppableProps}>
      {!items.length ? <tr><td colSpan={10} className="p-8 text-center">Không có chương phù hợp.</td></tr> : items.map((item, index) => <Draggable key={item.idChuong} draggableId={String(item.idChuong)} index={index} isDragDisabled={dragDisabled || busy}>{(provided) => <tr ref={provided.innerRef} {...provided.draggableProps} className="border-t hover:bg-muted/50">
        <td className="p-3"><input type="checkbox" aria-label={`Chọn chương ${item.chuongSo}: ${item.tieuDeChuong}`} checked={selected.includes(item.idChuong)} onChange={() => toggle(item.idChuong)} disabled={busy} /></td>
        <td className="p-2"><button type="button" {...provided.dragHandleProps} aria-label={`Đổi vị trí chương ${item.chuongSo}`} className="text-muted-foreground disabled:opacity-30" disabled={dragDisabled || busy}><GripVertical className="size-4" /></button></td>
        <td className="p-3 tabular-nums">#{item.idChuong}</td><td className="min-w-36 max-w-52 break-words p-3">{item.truyen?.tenTruyen}</td><td className="p-3 tabular-nums">{item.chuongSo}</td>
        <td className="min-w-56 max-w-96 break-words p-3"><p className="font-medium">{item.tieuDeChuong}</p><div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><span className="max-w-52 truncate" title={item.slug}>{item.slug}</span><button type="button" aria-label={`Sao chép slug ${item.slug}`} className="rounded p-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" onClick={() => void navigator.clipboard.writeText(item.slug).then(() => toast.success("Đã sao chép slug")).catch(() => toast.error("Không thể sao chép"))}><Copy className="size-3" /></button></div></td>
        <td className="whitespace-nowrap p-3 tabular-nums"><span className={(item.giaXu ?? 0) > 0 ? "font-medium text-fuchsia-700 dark:text-fuchsia-300" : "text-muted-foreground"}>{(item.giaXu ?? 0) > 0 ? `${item.giaXu} xu VIP` : "Miễn phí"}</span></td>
        <td className="whitespace-nowrap p-3 tabular-nums"><span className={`rounded-full px-2 py-1 text-xs ${(item.wordCount ?? 0) < 100 ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" : "bg-muted"}`}>{(item.wordCount ?? 0).toLocaleString("vi-VN")} chữ</span></td>
        <td className="whitespace-nowrap p-3 text-xs">{item.createdAt ? new Date(item.createdAt).toLocaleDateString("vi-VN") : "—"}</td>
        <td className="p-3"><div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => onPreview(item.idChuong)}><Eye className="size-3.5" />Xem</Button><Button size="sm" variant="outline" onClick={() => onEdit(item)}><Edit2 className="size-3.5" />Sửa</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => void deleteOne(item.idChuong)}><Trash2 className="size-3.5" />Xóa</Button></div></td>
      </tr>}</Draggable>)}{provided.placeholder}
    </tbody>}</Droppable></DragDropContext></table></div>
    <ChapterPriceSheet target={priceOpen ? { kind: "chapters", ids: selected } : null} onClose={() => setPriceOpen(false)} onSuccess={() => { setSelected([]); refresh(); }} />
  </div>;
}
