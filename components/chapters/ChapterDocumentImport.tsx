"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { chapterTitleSlug, singleDocumentChapter, type WritingChapter } from "./chapter-editor-state";

type ParsedChapter = { chuongSo: number; tieuDeChuong: string; noiDung: string; slug?: string };
type Preview = { text: string; chapters: ParsedChapter[]; warnings?: string[] };
type Row = ParsedChapter & { selected: boolean; giaXu: number; publication: "draft" | "published" };
type Props = {
  endpoint: string;
  storyId: number;
  disabled?: boolean;
  onLoad: (chapter: ParsedChapter) => void;
  onImported: () => void;
};

export default function ChapterDocumentImport({ endpoint, storyId, disabled, onLoad, onImported }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [mode, setMode] = useState<"single" | "split">("single");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [price, setPrice] = useState(0);
  const [publication, setPublication] = useState<"draft" | "published">("draft");
  async function readFile(file?: File) {
    if (!file) return;
    setError(""); setNotice("");
    if (!/\.(docx|txt|md)$/i.test(file.name) || file.size > 10 * 1024 * 1024) {
      setError("Chọn file .docx, .txt hoặc .md, tối đa 10 MB."); return;
    }
    setBusy(true);
    try {
      const form = new FormData(); form.set("file", file); form.set("mode", "preview"); form.set("idTruyen", String(storyId));
      const response = await fetch(endpoint, { method: "POST", body: form });
      const body: { success?: boolean; message?: string; data?: Preview } = await response.json();
      if (!response.ok || !body.success || !body.data) throw new Error(body.message || "Không thể đọc file soạn thảo.");
      setPreview(body.data);
      setRows(body.data.chapters.map(item => ({ ...item, selected: true, giaXu: 0, publication: "draft" })));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể đọc file."); }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = ""; }
  }
  async function importSelected() {
    setBusy(true); setError("");
    try {
      const chapters: Omit<WritingChapter, "idTruyen">[] = rows.filter(row => row.selected).map(row => ({
        chuongSo: row.chuongSo, tieuDeChuong: row.tieuDeChuong,
        slug: chapterTitleSlug(row.chuongSo, row.tieuDeChuong), noiDung: row.noiDung,
        isFree: row.giaXu === 0, giaXu: row.giaXu, publication: row.publication,
      }));
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idTruyen: storyId, chapters }) });
      const body: { success?: boolean; message?: string } = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || "Import không thành công; chưa lưu chương nào.");
      setNotice(`Đã nhập ${chapters.length} chương.`); setPreview(null); setRows([]); onImported();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể import chương."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3">
    <input ref={fileInput} type="file" accept=".docx,.txt,.md" className="sr-only" aria-label="File soạn thảo" onChange={event => void readFile(event.target.files?.[0])} />
    <Button type="button" variant="outline" disabled={disabled || busy || !storyId} onClick={() => fileInput.current?.click()}>
      {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <FileUp aria-hidden className="size-4" />} Import từ file (.docx / .txt / .md)
    </Button>
    {notice ? <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p> : null}
    {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    {preview ? <div className="rounded-xl border border-current/20 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Xem trước file soạn thảo</h3><Button type="button" size="icon" variant="ghost" aria-label="Đóng xem trước file" disabled={busy} onClick={() => setPreview(null)}><X aria-hidden className="size-4" /></Button></div>
      <fieldset className="flex flex-wrap gap-4 text-sm"><legend className="sr-only">Cách nhập file</legend>
        <label className="flex items-center gap-2"><input type="radio" checked={mode === "single"} onChange={() => setMode("single")} /> Nạp vào chương đang viết</label>
        <label className="flex items-center gap-2"><input type="radio" checked={mode === "split"} onChange={() => setMode("split")} /> Tự động tách nhiều chương</label>
      </fieldset>
      {preview.warnings?.map((warning, index) => <p key={index} className="text-sm text-amber-700 dark:text-amber-300">{warning}</p>)}
      {mode === "single" ? <>
        <p className="text-sm opacity-80">Toàn bộ nội dung sẽ thay thế nội dung đang viết. Bạn có thể chỉnh sửa trước khi lưu.</p>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-current/15 p-3 text-sm">{preview.text.slice(0, 2500)}{preview.text.length > 2500 ? "\n…" : ""}</pre>
        <Button type="button" onClick={() => { onLoad(singleDocumentChapter(preview.text)); setPreview(null); }}>Nạp vào chương đang viết</Button>
      </> : <>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="space-y-1">Giá xu hàng loạt<input aria-label="Giá xu hàng loạt" type="number" min="0" max="1000000" value={price} onChange={event => setPrice(Number(event.target.value))} className="block w-28 rounded-md border border-current/20 bg-transparent p-2" /></label>
          <label className="space-y-1">Trạng thái hàng loạt<select aria-label="Trạng thái hàng loạt" value={publication} onChange={event => setPublication(event.target.value as "draft" | "published")} className="block rounded-md border border-current/20 bg-transparent p-2"><option value="draft">Bản nháp (Ẩn)</option><option value="published">Xuất bản công khai</option></select></label>
          <Button type="button" variant="outline" onClick={() => setRows(current => current.map(row => row.selected ? { ...row, giaXu: Math.max(0, Math.floor(price)), publication } : row))}>Áp dụng cho chương đã chọn</Button>
        </div>
        <div className="max-h-80 overflow-auto rounded-lg border border-current/15"><table className="w-full text-sm"><caption className="sr-only">Danh sách chương đã tách</caption><thead className="sticky top-0 bg-background text-foreground"><tr><th className="p-2"><input aria-label="Chọn tất cả chương" type="checkbox" checked={rows.length > 0 && rows.every(row => row.selected)} onChange={event => setRows(current => current.map(row => ({ ...row, selected: event.target.checked })))} /></th><th className="p-2 text-left">Số</th><th className="p-2 text-left">Tiêu đề</th><th className="p-2 text-left">Xu / Trạng thái</th></tr></thead><tbody>
          {rows.map((row, index) => <tr key={index} className="border-t border-current/10" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 56px" }}>
            <td className="p-2"><input type="checkbox" aria-label={`Chọn chương ${row.chuongSo}`} checked={row.selected} onChange={event => setRows(current => current.map((item, i) => i === index ? { ...item, selected: event.target.checked } : item))} /></td>
            <td className="p-2"><input aria-label={`Số chương hàng ${index + 1}`} type="number" min="0.1" step="0.1" value={row.chuongSo} onChange={event => setRows(current => current.map((item, i) => i === index ? { ...item, chuongSo: Number(event.target.value) } : item))} className="w-20 rounded border border-current/20 bg-transparent p-2" /></td>
            <td className="min-w-44 p-2"><input aria-label={`Tiêu đề chương ${row.chuongSo}`} value={row.tieuDeChuong} maxLength={300} onChange={event => setRows(current => current.map((item, i) => i === index ? { ...item, tieuDeChuong: event.target.value } : item))} className="w-full rounded border border-current/20 bg-transparent p-2" /></td>
            <td className="p-2 whitespace-nowrap">{row.giaXu} xu · {row.publication === "draft" ? "Nháp" : "Công khai"}</td>
          </tr>)}
        </tbody></table></div>
        <p className="text-xs opacity-80">Nếu trùng số chương hoặc slug, toàn bộ lượt import được hoàn tác để bạn sửa lại.</p>
        <Button type="button" disabled={busy || !rows.some(row => row.selected)} onClick={() => void importSelected()}>{busy ? "Đang import…" : `Import tất cả chương đã chọn (${rows.filter(row => row.selected).length})`}</Button>
      </>}
    </div> : null}
  </section>;
}
