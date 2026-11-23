"use client";

import { useEffect, useEffectEvent, useId, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { Download, Globe, LoaderCircle, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { terminal, type ImportJob, type ImportOptions } from "@/lib/scraper/types";

const KEY = "admin-story-import-job";
const labels = { queued: "Đang chờ…", running: "Đang import…", cancelling: "Đang dừng…", completed: "Đã hoàn tất phạm vi import", partial: "Đã lưu một phần", cancelled: "Đã dừng import", failed: "Import chưa hoàn tất", interrupted: "Phiên import bị gián đoạn" };
const phaseLabels = { metadata: "Nhận diện thông tin truyện", catalogue: "Duyệt mục lục và các trang tiếp theo", chapters: "Tải và lưu nội dung chương", waiting: "Đang chờ website cho phép tải tiếp", finished: "Đã kết thúc" };
const defaults: Omit<ImportOptions, "url"> = { downloadImages: true, skipExisting: true, skipLocked: true };

class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(data?.message || "Không thể kết nối. Hãy thử lại.", response.status, data?.code);
  if (!data) throw new Error("Server không trả dữ liệu hợp lệ. Hãy thử kết nối lại.");
  return data;
}

export function ImportOptionsForm({ initialOptions, starting, onStart }: {
  initialOptions: ImportOptions | null; starting: boolean; onStart: (options: ImportOptions) => Promise<void>;
}) {
  const helpId = useId();
  const [scope, setScope] = useState<"all" | "limited">(initialOptions?.maxChapters ? "limited" : "all");
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    void onStart({ url: String(data.get("url")).trim(),
      ...(scope === "limited" ? { maxChapters: Number(data.get("maxChapters")) } : {}),
      downloadImages: data.has("downloadImages"), skipExisting: data.has("skipExisting"), skipLocked: data.has("skipLocked"),
    });
  }
  return <form onSubmit={submit} className="mt-5 space-y-4">
    <label className="block space-y-2 text-sm font-medium"><span>URL bộ truyện</span><Input name="url" type="url" required maxLength={2000} autoComplete="off" spellCheck={false} defaultValue={initialOptions?.url ?? ""} placeholder="https://website.com/ten-truyen…" aria-describedby={helpId} disabled={starting} /></label>
    <p id={helpId} className="text-xs text-muted-foreground">Dùng URL trang giới thiệu truyện, không phải trang chủ hoặc một chương riêng.</p>
    <fieldset disabled={starting} className="space-y-2"><legend className="mb-2 text-sm font-medium">Phạm vi lấy chương</legend>
      <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${scope === "all" ? "border-primary bg-primary/5" : ""}`}>
        <input type="radio" name="chapterScope" value="all" checked={scope === "all"} onChange={() => setScope("all")} className="mt-0.5 size-4 shrink-0 accent-primary focus-visible:outline-2" />
        <span><span className="block font-medium">Toàn bộ chương công khai</span><span className="mt-1 block text-xs text-muted-foreground">Duyệt hết mục lục, bao gồm các trang kế tiếp. Mặc định bỏ qua chương đã có.</span></span>
      </label>
      <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${scope === "limited" ? "border-primary bg-primary/5" : ""}`}>
        <input type="radio" name="chapterScope" value="limited" checked={scope === "limited"} onChange={() => setScope("limited")} className="size-4 shrink-0 accent-primary focus-visible:outline-2" /><span>Giới hạn số chương</span>
      </label>
      <label className="block space-y-2 text-sm"><span className={scope === "all" ? "text-muted-foreground" : ""}>Số chương tối đa</span><Input name="maxChapters" type="number" min={1} max={50000} step={1} required={scope === "limited"} disabled={scope === "all" || starting} defaultValue={initialOptions?.maxChapters ?? 5} inputMode="numeric" autoComplete="off" aria-describedby={scope === "all" ? helpId : undefined} /></label>
    </fieldset>
    <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium focus-visible:outline-2">Tùy chọn nâng cao</summary><fieldset disabled={starting} className="mt-3 space-y-3 text-sm"><legend className="sr-only">Cách lưu nội dung</legend>
      <label className="flex items-center gap-2"><input type="checkbox" name="downloadImages" defaultChecked={initialOptions?.downloadImages ?? true} className="size-4 accent-primary" />Tải hình ảnh trong chương về server</label>
      <label className="flex items-center gap-2"><input type="checkbox" name="skipExisting" defaultChecked={initialOptions?.skipExisting ?? true} className="size-4 accent-primary" />Bỏ qua chương đã tồn tại</label>
      <label className="flex items-center gap-2"><input type="checkbox" name="skipLocked" defaultChecked={initialOptions?.skipLocked ?? true} className="size-4 accent-primary" />Bỏ qua chương VIP/khóa</label>
      <p className="text-xs text-muted-foreground">Bỏ chọn “Bỏ qua chương đã tồn tại” sẽ cập nhật nội dung chương. Bỏ chọn “Bỏ qua chương VIP/khóa” sẽ dừng khi gặp khóa, không mở khóa chương.</p>
    </fieldset></details>
    <p className="rounded-md bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">Có bộ đọc riêng cho LoHi, Truyện Đọc Việt và Lạc Ca. Với website khác, hệ thống tự dò nội dung HTML công khai; nếu không hỗ trợ, tiến trình sẽ ghi rõ lý do. Website yêu cầu đăng nhập, trả phí hoặc kiểm tra bảo mật sẽ không được vượt qua.</p>
    <Button type="submit" disabled={starting} className="w-full">{starting ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <Download aria-hidden="true" className="size-4" />}{starting ? "Đang khởi tạo…" : scope === "all" ? "Bắt đầu lấy toàn bộ chương" : "Bắt đầu Import"}</Button>
  </form>;
}

export function ImportProgress({ job, children }: { job: ImportJob; children: ReactNode }) {
  const logRef = useRef<HTMLDivElement>(null), followLogs = useRef(true);
  const progressId = useId();
  useEffect(() => { if (followLogs.current) logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "instant" }); }, [job.logs]);
  const percent = job.totalChapters ? Math.min(100, Math.round(job.processedChapters * 100 / job.totalChapters)) : 0;
  const phase = job.phase ? phaseLabels[job.phase] : terminal(job.status) ? "Đã kết thúc" : "Đang đọc thông tin truyện và mục lục…";
  return <div className="mt-5 space-y-4">
    <div className="flex items-center gap-3">{job.cover && <Image src={job.cover} width={56} height={80} unoptimized alt={`Bìa ${job.storyTitle}`} className="h-20 w-14 rounded object-cover" />}<div className="min-w-0"><h3 className="break-words font-semibold">{job.storyTitle}</h3><p role="status" className="text-sm text-muted-foreground">{labels[job.status]}</p>{(job.sourceName || job.sourceHost) && <p className="mt-1 break-words text-xs text-muted-foreground">{job.sourceName || job.sourceHost}</p>}</div></div>
    <div className="rounded-lg border p-3 text-sm"><p className="font-medium">{phase}</p><p className="mt-1 text-xs text-muted-foreground">{job.options?.maxChapters ? `Phạm vi: tối đa ${job.options.maxChapters} chương.` : "Phạm vi: toàn bộ chương công khai tìm thấy trong mục lục."}</p>
      {job.sourceTotalChapters !== undefined && <p className="mt-1 text-xs text-muted-foreground">Nguồn công bố {job.sourceTotalChapters} chương.</p>}
      {job.phase === "waiting" && job.retryAt && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">Website giới hạn tốc độ. Tự tiếp tục sau {new Date(job.retryAt).toLocaleTimeString("vi-VN")}; bạn vẫn có thể dừng import.</p>}
    </div>
    {job.totalChapters > 0 ? <div><label htmlFor={progressId} className="mb-1 flex justify-between gap-2 text-sm tabular-nums"><span>{job.processedChapters}/{job.totalChapters} chương trong phạm vi đã xử lý</span><span>{percent}%</span></label><progress id={progressId} max={100} value={percent} className="h-3 w-full accent-primary" /></div> : <p className="text-sm text-muted-foreground">{terminal(job.status) ? "Chưa đọc được mục lục. Xem nguyên nhân bên dưới." : "Chưa bắt đầu tải chương; đang nhận diện mục lục."}</p>}
    <p aria-live="polite" aria-atomic="true" className="text-sm tabular-nums">Đã lưu: {job.savedChapters} chương | Đã bỏ qua: {job.skippedChapters} | Ảnh đã tải: {job.downloadedImages}</p>
    <p className="text-xs text-muted-foreground">Trong số đã bỏ qua có {job.lockedChapters} chương VIP/khóa. Chương gặp lỗi: {job.failedChapters}.</p>
    {(job.warning || job.catalogueComplete === false) && <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-200">{job.warning || "Chưa xác nhận được mục lục đầy đủ. Kết quả này không bảo đảm đã có mọi chương của nguồn."}</p>}
    {job.error && <div role="alert" className="rounded-md border border-destructive/30 p-3 text-sm"><h4 className="font-medium text-destructive">Vì sao chưa lấy được đầy đủ?</h4><p className="mt-1 break-words">{job.error}</p>{job.errorCode && <p className="mt-2 text-xs text-muted-foreground">Mã hỗ trợ: {job.errorCode}</p>}{job.requestId && <p className="mt-1 text-xs text-muted-foreground">Request ID: <code translate="no" className="break-all">{job.requestId}</code></p>}{job.errorCode === "CHECKPOINT_FAILED" && <Link href={`/admin/system-logs?q=${encodeURIComponent(job.id)}`} className="mt-2 inline-flex text-xs font-medium text-blue-700 underline-offset-4 hover:underline focus-visible:outline-2 dark:text-blue-300">Mở nhật ký của phiên này</Link>}</div>}
    {!!job.issues?.length && <details className="rounded-md border p-3 text-sm"><summary className="cursor-pointer focus-visible:outline-2">Chi tiết chương chưa lấy được</summary><ul className="mt-2 list-disc space-y-2 pl-5">{job.issues.slice(0, 10).map((issue, i) => <li key={i} className="break-words">{issue.chapter !== undefined ? `Chương ${issue.chapter}: ` : ""}{issue.reason}</li>)}</ul>{job.issues.length > 10 && <p className="mt-2 text-xs text-muted-foreground">Còn {job.issues.length - 10} mục khác trong nhật ký.</p>}</details>}
    <div ref={logRef} onScroll={() => { const el = logRef.current; if (el) followLogs.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }} role="log" aria-live="off" tabIndex={0} aria-label="Nhật ký import" className="h-40 overflow-auto overscroll-contain rounded-md border bg-muted/40 p-3 text-xs focus-visible:outline-2">{job.logs.length ? job.logs.map((line, i) => <p key={i} className="mb-1 break-words [content-visibility:auto]">{line}</p>) : <p className="text-muted-foreground">Đang chờ nhật ký…</p>}</div>
    {children}
    <p className="text-xs text-muted-foreground">Đóng cửa sổ vẫn giữ tiến trình trên server. Phiên dài có thể chia theo thời gian chạy; dùng “Tiếp tục chương còn thiếu” để nối tiếp từ dữ liệu đã lưu mà không tải lại chương đã có.</p>
  </div>;
}

export default function ImportUrlModal({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false), [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null), [error, setError] = useState("");
  const [draft, setDraft] = useState<ImportOptions | null>(null), [missingJob, setMissingJob] = useState(false);
  const [starting, setStarting] = useState(false), [stopping, setStopping] = useState(false), [pollVersion, setPollVersion] = useState(0);
  const refreshed = useRef<string | null>(null), errorRef = useRef<HTMLParagraphElement>(null);
  const refresh = useEffectEvent(onImported);
  useEffect(() => {
    const id = jobId || sessionStorage.getItem(KEY); if (!id) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await api<ImportJob>(`/api/admin/stories/import-url/${id}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setJob(next); setError(""); setMissingJob(false);
        if (next.sourceUrl) setDraft({ ...defaults, ...next.options, url: next.sourceUrl });
        if (terminal(next.status)) {
          // Keep the owner-scoped durable job ID after completion/interruption.
          // A reload must still offer resume until the Admin explicitly resets it.
          if (refreshed.current !== next.id) { refreshed.current = next.id; refresh(); }
        } else timer = setTimeout(poll, 1500);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && (err.code === "CHECKPOINT_FAILED" || err.code === "CHECKPOINT_INVALID")) {
          sessionStorage.removeItem(KEY); setMissingJob(true); setError(err.message);
        } else if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
          sessionStorage.removeItem(KEY); setMissingJob(true);
          setError(err.status === 404 ? "Không còn tìm thấy phiên này trên server. Các chương đã lưu vẫn còn; hãy nhập lại URL và bật bỏ qua chương đã tồn tại." : "Phiên đăng nhập đã hết hạn hoặc không có quyền xem import này. Hãy đăng nhập lại.");
        } else { setError("Mất kết nối theo dõi tiến độ. Đang thử kết nối lại; tiến trình trên server có thể vẫn chạy."); timer = setTimeout(poll, 3000); }
      }
    }
    void poll(); return () => { controller.abort(); clearTimeout(timer); };
  }, [jobId, pollVersion]);
  useEffect(() => { if (error && open) errorRef.current?.focus(); }, [error, open]);
  const runningJob = !!job && !terminal(job.status) && !missingJob;
  const active = starting || runningJob;
  function acceptJob(id: string, options?: ImportOptions) {
    sessionStorage.setItem(KEY, id); setJobId(id); setMissingJob(false); setError("");
    if (options) setDraft(options);
    setJob({ id, status: "queued", storyTitle: "Đang nhận diện truyện…", totalChapters: 0, processedChapters: 0, savedChapters: 0, skippedChapters: 0, lockedChapters: 0, failedChapters: 0, downloadedImages: 0, logs: [], options, sourceUrl: options?.url });
  }
  async function start(options: ImportOptions) {
    setError(""); setStarting(true); setDraft(options);
    try { const response = await api<{ jobId: string }>("/api/admin/stories/import-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(options) }); acceptJob(response.jobId, options); }
    catch (err) { setError(err instanceof Error ? err.message : "Không thể bắt đầu import."); } finally { setStarting(false); }
  }
  async function resume() {
    if (!job) return; setStarting(true); setError("");
    try { const response = await api<{ jobId: string }>(`/api/admin/stories/import-url/${job.id}`, { method: "POST" }); acceptJob(response.jobId, draft ? { ...draft, skipExisting: true } : undefined); }
    catch (err) { setError(err instanceof Error ? err.message : "Không thể tiếp tục import. Hãy nhập lại URL."); } finally { setStarting(false); }
  }
  async function stop() {
    if (!job || stopping) return; setStopping(true);
    try { setJob(await api<ImportJob>(`/api/admin/stories/import-url/${job.id}`, { method: "DELETE" })); }
    catch (err) { setError(err instanceof Error ? err.message : "Không thể dừng import."); } finally { setStopping(false); }
  }
  function reset() { sessionStorage.removeItem(KEY); setJob(null); setJobId(null); setMissingJob(false); setError(""); }
  const completedLimited = job?.status === "completed" && !!job.options?.maxChapters;
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><Button variant="outline"><Globe aria-hidden="true" className="size-4" />{active ? "Theo dõi import" : "Import từ URL"}</Button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-xl border bg-background p-5 text-foreground shadow-xl sm:p-6">
        <Dialog.Title className="pr-8 text-xl font-semibold">Import từ URL</Dialog.Title>
        <Dialog.Description className="mt-2 text-sm text-muted-foreground">Lấy toàn bộ chương công khai hoặc chọn giới hạn. Hệ thống giữ phần đã lưu và ghi rõ lý do khi nguồn không cho đọc hoặc chưa được hỗ trợ.</Dialog.Description>
        <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Đóng cửa sổ import" className="absolute right-3 top-3"><X aria-hidden="true" className="size-4" /></Button></Dialog.Close>
        {error && <p ref={errorRef} tabIndex={-1} role="alert" className="mt-4 rounded-md border border-destructive/30 p-3 text-sm text-destructive focus-visible:outline-2">{error}</p>}
        {!job ? <ImportOptionsForm initialOptions={draft} starting={starting} onStart={start} /> : <ImportProgress job={job}>
          <div className="flex flex-wrap justify-end gap-2">
            {runningJob ? <Button variant="destructive" disabled={stopping || job.status === "cancelling"} onClick={stop}>Dừng import</Button> : <>
              <Button variant="outline" disabled={starting} onClick={reset}>{missingJob ? "Nhập lại URL" : "Import truyện khác"}</Button>
              {!missingJob && <Button disabled={starting} onClick={() => {
                if (completedLimited && draft) { const all = { ...draft, skipExisting: true }; delete all.maxChapters; void start(all); }
                else void resume();
              }}><RotateCcw aria-hidden="true" className="size-4" />{starting ? "Đang khởi tạo…" : completedLimited ? "Lấy toàn bộ chương công khai" : job.status === "completed" ? "Kiểm tra chương mới" : "Tiếp tục chương còn thiếu"}</Button>}
            </>}
            {error && !missingJob && <Button variant="outline" onClick={() => setPollVersion(v => v + 1)}>Kết nối lại tiến độ</Button>}
            {job.storyId && terminal(job.status) && <Link href={`/admin/stories/${job.storyId}`} className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm text-primary-foreground focus-visible:outline-2">Xem truyện ngay</Link>}
          </div>
        </ImportProgress>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
