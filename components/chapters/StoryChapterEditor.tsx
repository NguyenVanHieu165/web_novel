"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Maximize2, Minimize2, Save, Sparkles, Scissors, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import ChapterDocumentImport from "./ChapterDocumentImport";
import { chapterTitleSlug, cleanWritingText, decodeWritingDraft, emptyWritingChapter, writingDraftKey, writingStatistics, type WritingChapter } from "./chapter-editor-state";

export type StoryChapterEditorProps = {
  accountId: number;
  stories: { idTruyen: number; tenTruyen: string }[];
  initial: WritingChapter;
  nextNumberUrl: (storyId: number) => string;
  importUrl: (storyId: number) => string;
  onSave: (value: WritingChapter, writeNext: boolean) => Promise<void>;
  onImported: () => void;
  onCancel?: () => void;
  draftRef?: { current: WritingChapter | null };
  actionsRef?: { current: { replaceContent: (content: string) => void } | null };
  collaboration?: { controls: ReactNode; content?: ReactNode; getContent?: () => string };
};

const inputClass = "w-full rounded-lg border border-current/20 bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500";
const papers = { light: { background: "#ffffff", color: "#1e293b" }, sepia: { background: "#f7efdf", color: "#493a27" }, dark: { background: "#181c24", color: "#e2e8f0" } };
const subscribeDraft = (callback: () => void) => { window.addEventListener("storage", callback); return () => window.removeEventListener("storage", callback); };
const serverDraft = () => null;

export default function StoryChapterEditor({ accountId, stories, initial, nextNumberUrl, importUrl, onSave, onImported, onCancel, collaboration, draftRef, actionsRef }: StoryChapterEditorProps) {
  const [value, setValue] = useState(initial);
  const [paper, setPaper] = useState<keyof typeof papers>("light");
  const [fontSize, setFontSize] = useState(18);
  const [zen, setZen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [handledDraft, setHandledDraft] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const zenButton = useRef<HTMLButtonElement>(null);
  const latest = useRef({ value, getContent: collaboration?.getContent });
  useEffect(() => { latest.current = { value, getContent: collaboration?.getContent }; if (draftRef) draftRef.current = value; }, [value, collaboration?.getContent, draftRef]);
  useEffect(() => {
    if (!actionsRef) return;
    actionsRef.current = { replaceContent: content => setValue(current => ({ ...current, noiDung: content })) };
    return () => { actionsRef.current = null; };
  }, [actionsRef]);
  const baseline = useRef(JSON.stringify(initial));
  const manualNumber = useRef(false);
  const id = useId();
  const key = writingDraftKey(accountId, value.idTruyen, value.idChuong);
  const stats = writingStatistics(value.noiDung);

  const readDraft = useCallback(() => { try { return localStorage.getItem(key); } catch { return null; } }, [key]);
  const rawDraft = useSyncExternalStore(subscribeDraft, readDraft, serverDraft);
  const savedDraft = handledDraft === key ? null : decodeWritingDraft(rawDraft);
  const restore = savedDraft && savedDraft.value.idTruyen === value.idTruyen && savedDraft.value.idChuong === value.idChuong && JSON.stringify(savedDraft.value) !== JSON.stringify(initial) ? savedDraft : null;

  useEffect(() => {
    if (!accountId || !value.idTruyen || restore) return;
    const tick = () => {
      const current = latest.current;
      const snapshot = { ...current.value, noiDung: current.getContent ? current.getContent() : current.value.noiDung };
      if (current.getContent) setValue(previous => previous.noiDung === snapshot.noiDung ? previous : { ...previous, noiDung: snapshot.noiDung });
      if (JSON.stringify(snapshot) === baseline.current) return;
      try {
        setHandledDraft(key);
        localStorage.setItem(key, JSON.stringify({ version: 1, value: snapshot, savedAt: Date.now() }));
        setSaveMessage(`Đã lưu nháp trên thiết bị · ${new Date().toLocaleTimeString("vi-VN")}`);
      } catch { setSaveMessage("Không lưu được nháp trên thiết bị. Hãy lưu lên server để giữ nội dung."); }
    };
    const timer = setInterval(tick, 3000);
    const guard = (event: BeforeUnloadEvent) => {
      const current = latest.current;
      const snapshot = { ...current.value, noiDung: current.getContent ? current.getContent() : current.value.noiDung };
      if (JSON.stringify(snapshot) !== baseline.current) { tick(); event.preventDefault(); }
    };
    window.addEventListener("beforeunload", guard);
    return () => {
      clearInterval(timer); window.removeEventListener("beforeunload", guard);
      const current = latest.current;
      const snapshot = { ...current.value, noiDung: current.getContent ? current.getContent() : current.value.noiDung };
      if (snapshot.idTruyen === value.idTruyen && JSON.stringify(snapshot) !== baseline.current) {
        try { localStorage.setItem(key, JSON.stringify({ version: 1, value: snapshot, savedAt: Date.now() })); } catch { /* The visible autosave status already reports storage failures. */ }
      }
    };
  }, [accountId, key, restore, value.idTruyen]);

  useEffect(() => {
    if (value.idChuong || !value.idTruyen) return;
    const controller = new AbortController();
    const storyId = value.idTruyen;
    void fetch(nextNumberUrl(storyId), { signal: controller.signal, cache: "no-store" }).then(async response => {
      const body: { data?: { nextNumber?: number }; message?: string } = await response.json();
      if (!response.ok) throw new Error(body.message || "Không lấy được số chương kế tiếp.");
      if (!controller.signal.aborted && !manualNumber.current && body.data?.nextNumber) {
        setValue(previous => previous.idTruyen === storyId && !previous.idChuong ? { ...previous, chuongSo: Number(body.data!.nextNumber) } : previous);
      }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Không lấy được số chương kế tiếp."); });
    return () => controller.abort();
  }, [nextNumberUrl, value.idTruyen, value.idChuong]);

  useEffect(() => {
    if (!zen) return;
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setZen(false); zenButton.current?.focus(); }
    };
    const onFullscreen = () => { if (!document.fullscreenElement) setZen(false); };
    document.addEventListener("keydown", onKey); document.addEventListener("fullscreenchange", onFullscreen);
    return () => { document.body.style.overflow = prior; document.removeEventListener("keydown", onKey); document.removeEventListener("fullscreenchange", onFullscreen); };
  }, [zen]);

  async function toggleZen() {
    if (zen) { if (document.fullscreenElement) await document.exitFullscreen(); setZen(false); zenButton.current?.focus(); }
    else { setZen(true); try { await root.current?.requestFullscreen(); } catch { setSaveMessage("Chế độ tập trung đã bật. Nhấn Esc để thoát."); } }
  }
  function patch(change: Partial<WritingChapter>) { setValue(current => ({ ...current, ...change })); setError(""); }
  function insert(text: string) {
    const element = textarea.current;
    if (!element) return;
    const start = element.selectionStart, end = element.selectionEnd;
    patch({ noiDung: `${value.noiDung.slice(0, start)}${text}${value.noiDung.slice(end)}` });
    requestAnimationFrame(() => { element.focus(); element.setSelectionRange(start + text.length, start + text.length); });
  }
  async function save(writeNext: boolean) {
    setError("");
    const snapshot = { ...value, noiDung: cleanWritingText(collaboration?.getContent ? collaboration.getContent() : value.noiDung), tieuDeChuong: cleanWritingText(value.tieuDeChuong), slug: value.slug || chapterTitleSlug(value.chuongSo, value.tieuDeChuong), isFree: value.giaXu === 0 };
    if (!snapshot.idTruyen || !snapshot.tieuDeChuong || !snapshot.noiDung.trim() || !snapshot.chuongSo || !Number.isFinite(snapshot.chuongSo) || snapshot.chuongSo <= 0 || !Number.isInteger(snapshot.giaXu) || snapshot.giaXu < 0) {
      setError("Chọn truyện, nhập số chương hợp lệ, tiêu đề và nội dung; giá xu là số nguyên không âm."); return;
    }
    setBusy(true);
    try {
      await onSave(snapshot, writeNext);
      baseline.current = JSON.stringify(snapshot);
      try { localStorage.removeItem(key); } catch { /* Server save succeeded even when browser storage is unavailable. */ }
      setSaveMessage(snapshot.publication === "draft" ? "Đã lưu bản nháp lên server." : "Đã xuất bản chương.");
      if (writeNext) {
        manualNumber.current = false;
        const next = emptyWritingChapter(snapshot.idTruyen, snapshot.chuongSo + 1);
        baseline.current = JSON.stringify(next); setValue(next); setHandledDraft(key);
        const response = await fetch(nextNumberUrl(snapshot.idTruyen), { cache: "no-store" });
        const body: { data?: { nextNumber?: number } } = await response.json();
        if (response.ok && body.data?.nextNumber) setValue(current => ({ ...current, chuongSo: Number(body.data!.nextNumber) }));
        textarea.current?.focus();
      } else { setValue(snapshot); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu chương. Bản nháp vẫn được giữ trên thiết bị."); }
    finally { setBusy(false); }
  }

  return <div ref={root} onKeyDownCapture={event => { if (zen && event.key === "Escape") { event.stopPropagation(); void toggleZen(); } }} className={`${zen ? "fixed inset-0 z-[200] overflow-auto p-4 sm:p-8" : "rounded-xl border p-4 sm:p-5"} space-y-5`} style={{ ...papers[paper], fontFamily: "var(--font-reader-sans), system-ui, sans-serif" }}>
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{value.idChuong ? "Biên tập chương" : "Viết chương mới"}</h2><p className="text-xs opacity-70">Không gian dành cho câu chuyện của bạn</p></div><Button ref={zenButton} type="button" variant="outline" aria-pressed={zen} onClick={() => void toggleZen()}>{zen ? <Minimize2 aria-hidden className="size-4" /> : <Maximize2 aria-hidden className="size-4" />}{zen ? "Thoát tập trung" : "Tập trung"}</Button></header>
    {restore ? <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><p>Có bản nháp chưa lưu trên thiết bị ({new Date(restore.savedAt).toLocaleString("vi-VN")}). Khôi phục để viết tiếp?</p><div className="mt-2 flex gap-2"><Button type="button" onClick={() => { manualNumber.current = true; setValue(restore.value); setHandledDraft(key); }}>Khôi phục bản nháp</Button><Button type="button" variant="outline" onClick={() => { try { localStorage.removeItem(key); setHandledDraft(key); } catch { setError("Không thể xóa bản nháp trong trình duyệt."); } }}>Bỏ bản nháp cục bộ</Button></div></div> : null}
    <form onSubmit={event => { event.preventDefault(); void save(false); }} className="space-y-5">
      <fieldset disabled={busy || !!restore} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label htmlFor={`${id}-story`} className="space-y-1 text-sm sm:col-span-2">Truyện<select id={`${id}-story`} name="idTruyen" disabled={!!value.idChuong || stories.length <= 1} className={inputClass} value={value.idTruyen} onChange={event => { if (JSON.stringify(value) !== baseline.current && !window.confirm("Chuyển truyện sẽ đóng chương đang viết. Hãy lưu nội dung trước khi tiếp tục.")) return; manualNumber.current = false; const next = emptyWritingChapter(Number(event.target.value)); baseline.current = JSON.stringify(next); setValue(next); }}><option value={0}>Chọn truyện…</option>{stories.map(story => <option key={story.idTruyen} value={story.idTruyen}>{story.tenTruyen}</option>)}</select></label>
        <label htmlFor={`${id}-number`} className="space-y-1 text-sm">Số chương<input id={`${id}-number`} name="chuongSo" type="number" min="0.1" max="9999.9" step="0.1" required value={value.chuongSo} className={inputClass} onChange={event => { manualNumber.current = true; patch({ chuongSo: Number(event.target.value) }); }} /></label>
        <label htmlFor={`${id}-publication`} className="space-y-1 text-sm">Xuất bản<select id={`${id}-publication`} name="publication" className={inputClass} value={value.publication} onChange={event => patch({ publication: event.target.value as WritingChapter["publication"] })}><option value="draft">Bản nháp (Ẩn)</option><option value="published">Xuất bản công khai</option></select></label>
        <label htmlFor={`${id}-title`} className="space-y-1 text-sm sm:col-span-2">Tiêu đề chương<input id={`${id}-title`} name="tieuDeChuong" required autoComplete="off" maxLength={300} value={value.tieuDeChuong} className={inputClass} placeholder="Ví dụ: Cuộc gặp gỡ đầu tiên…" onChange={event => patch({ tieuDeChuong: event.target.value, ...(!value.idChuong ? { slug: chapterTitleSlug(value.chuongSo, event.target.value) } : {}) })} /></label>
        <label htmlFor={`${id}-slug`} className="space-y-1 text-sm sm:col-span-2">Đường dẫn chương (slug)<input id={`${id}-slug`} name="slug" maxLength={300} value={value.slug} className={inputClass} autoComplete="off" spellCheck={false} onChange={event => patch({ slug: event.target.value })} /></label>
        <div className="space-y-2 sm:col-span-2"><p className="text-sm">Giá chương</p><div className="flex flex-wrap gap-2">{[0, 3, 5, 10].map(price => <Button key={price} type="button" variant={value.giaXu === price ? "default" : "outline"} aria-pressed={value.giaXu === price} onClick={() => patch({ giaXu: price, isFree: price === 0 })}>{price ? `${price} xu` : "Miễn phí (0 xu)"}</Button>)}<label className="flex items-center gap-2 text-sm">Tùy chỉnh<input aria-label="Giá xu tùy chỉnh" type="number" min={0} step={1} max={1000000} value={value.giaXu} className={`${inputClass} max-w-24`} onChange={event => patch({ giaXu: Number(event.target.value), isFree: Number(event.target.value) === 0 })} /></label></div></div>
      </fieldset>
      <ChapterDocumentImport endpoint={importUrl(value.idTruyen)} storyId={value.idTruyen} disabled={busy || !!restore || !!collaboration?.content} onLoad={chapter => { manualNumber.current = true; patch({ noiDung: chapter.noiDung, ...(chapter.tieuDeChuong ? { tieuDeChuong: chapter.tieuDeChuong, slug: chapterTitleSlug(chapter.chuongSo, chapter.tieuDeChuong), chuongSo: chapter.chuongSo } : {}) }); }} onImported={onImported} />
      <div className="flex flex-wrap items-center gap-2 border-y border-current/10 py-3">
        <Button type="button" variant="outline" disabled={!!collaboration?.content || busy} onClick={() => patch({ noiDung: cleanWritingText(value.noiDung), tieuDeChuong: cleanWritingText(value.tieuDeChuong) })}><Sparkles aria-hidden className="size-4" />Chuẩn hóa tiếng Việt</Button>
        <Button type="button" variant="outline" disabled={!!collaboration?.content || busy} onClick={() => insert("\n\n* * *\n\n")}><Scissors aria-hidden className="size-4" />Phân cảnh</Button>
        <Button type="button" variant="outline" disabled={!!collaboration?.content || busy} onClick={() => insert("\n\nGhi chú tác giả:\n")}><StickyNote aria-hidden className="size-4" />Ghi chú tác giả</Button>
        <label className="flex items-center gap-2 text-xs">Giấy<select aria-label="Màu giấy viết" value={paper} className="rounded border border-current/20 bg-transparent p-2" onChange={event => setPaper(event.target.value as keyof typeof papers)}><option value="light">Sáng</option><option value="sepia">Giấy ngà Sepia</option><option value="dark">Ban đêm Dark</option></select></label>
        <label className="flex items-center gap-2 text-xs">Cỡ chữ<select aria-label="Cỡ chữ soạn thảo" value={fontSize} className="rounded border border-current/20 bg-transparent p-2" onChange={event => setFontSize(Number(event.target.value))}>{[16, 17, 18, 19, 20, 21, 22].map(size => <option key={size} value={size}>{size}px</option>)}</select></label>
      </div>
      {collaboration?.controls}
      <div className="mx-auto max-w-3xl"><label htmlFor={`${id}-content`} className="mb-2 block text-sm font-medium">Nội dung chương</label>{collaboration?.content ?? <textarea id={`${id}-content`} ref={textarea} name="noiDung" required value={value.noiDung} onChange={event => patch({ noiDung: event.target.value })} spellCheck lang="vi" placeholder="Bắt đầu câu chuyện của bạn…" disabled={busy || !!restore} className="min-h-[460px] w-full resize-y rounded-lg border border-current/15 bg-transparent p-4 leading-[1.9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 sm:p-6" style={{ fontSize, fontFamily: "var(--font-reader-serif), Georgia, serif" }} />}</div>
      <div className="flex flex-wrap justify-between gap-3 text-xs tabular-nums" aria-live="polite"><p>{stats.words.toLocaleString("vi-VN")} chữ · {stats.characters.toLocaleString("vi-VN")} ký tự · {stats.paragraphs} đoạn · ~{stats.minutes} phút đọc</p><p>{saveMessage || "Nháp tự lưu trên thiết bị mỗi 3 giây"}</p></div>
      {error ? <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">{error}</p> : null}
      <footer className="flex flex-wrap justify-end gap-2 border-t border-current/10 pt-4">{onCancel ? <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Đóng</Button> : null}<Button type="submit" disabled={busy || !!restore || !value.idTruyen}><Save aria-hidden className="size-4" />{busy ? "Đang lưu…" : value.publication === "draft" ? "Lưu bản nháp" : "Xuất bản chương"}</Button><Button type="button" variant="outline" disabled={busy || !!restore || !value.idTruyen} onClick={() => void save(true)}>Lưu & Viết tiếp chương sau</Button></footer>
    </form>
  </div>;
}

