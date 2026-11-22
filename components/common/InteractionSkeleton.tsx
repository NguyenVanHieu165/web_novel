const block = "rounded-lg bg-slate-200/70 dark:bg-zinc-800/60";

export function CommentSkeleton() {
  return (
    <section role="status" className="space-y-4 motion-safe:animate-pulse">
      <span className="sr-only">Đang tải bình luận…</span>
      <div aria-hidden="true" className="space-y-4">
        <div className={`h-6 w-40 ${block}`} />
        <div className={`h-24 w-full ${block}`} />
        {[0, 1, 2].map((index) => <div key={index} className={`h-20 w-full ${block}`} />)}
      </div>
    </section>
  );
}

export function ChapterListSkeleton() {
  return (
    <div role="status" className="space-y-3 motion-safe:animate-pulse">
      <span className="sr-only">Đang tải danh sách chương…</span>
      <div aria-hidden="true" className="space-y-3">
        <div className={`h-11 w-full ${block}`} />
        {[0, 1, 2, 3, 4, 5].map((index) => <div key={index} className={`h-12 w-full ${block}`} />)}
      </div>
    </div>
  );
}

export function ReaderPanelSkeleton() {
  return (
    <div role="status" className="pointer-events-none fixed inset-y-0 right-0 z-50 w-[min(92vw,28rem)] border-l border-[var(--reader-border)] bg-[var(--reader-paper)] p-6 text-[var(--reader-text)] shadow-xl">
      <span className="sr-only">Đang tải công cụ đọc…</span>
      <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
        <div className="h-7 w-40 rounded-lg bg-[var(--reader-surface)]" />
        {[0, 1, 2, 3].map((index) => <div key={index} className="h-16 rounded-lg bg-[var(--reader-surface)]" />)}
      </div>
    </div>
  );
}

export function AudioPlayerSkeleton() {
  return (
    <div role="status" className="pointer-events-none fixed inset-x-3 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-2xl border border-[var(--reader-border)] bg-[var(--reader-surface)] p-4 text-[var(--reader-text)] md:bottom-6">
      <span className="sr-only">Đang tải trình phát audio…</span>
      <div aria-hidden="true" className="h-32 rounded-lg bg-[var(--reader-bg)] motion-safe:animate-pulse" />
    </div>
  );
}
