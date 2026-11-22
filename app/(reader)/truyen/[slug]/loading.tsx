export default function StoryDetailLoading() {
  return (
    <div role="status" className="space-y-8 motion-safe:animate-pulse">
      <span className="sr-only">Đang tải chi tiết truyện…</span>
      <div aria-hidden="true" className="flex flex-col gap-8 rounded-3xl border border-slate-200/80 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 sm:p-8 lg:flex-row">
        <div className="mx-auto aspect-[2/3] w-[220px] shrink-0 rounded-2xl bg-slate-200/70 dark:bg-zinc-800/60 sm:w-[290px]" />
        <div className="flex-1 space-y-5">
          <div className="h-5 w-24 rounded-lg bg-slate-200/70 dark:bg-zinc-800/60" />
          <div className="h-10 w-3/4 rounded-lg bg-slate-200/70 dark:bg-zinc-800/60" />
          <div className="h-6 w-1/2 rounded-lg bg-slate-200/70 dark:bg-zinc-800/60" />
          <div className="h-24 rounded-xl bg-slate-200/50 dark:bg-zinc-800/40" />
          <div className="h-12 rounded-xl bg-slate-200/70 dark:bg-zinc-800/60" />
        </div>
      </div>
      <div aria-hidden="true" className="space-y-6">
        <div className="h-12 w-full rounded-2xl bg-slate-200/70 dark:bg-zinc-800/60" />
        <div className="space-y-4 rounded-3xl border border-slate-200/80 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
          <div className="h-6 w-48 rounded-lg bg-slate-200/70 dark:bg-zinc-800/60" />
          {[0, 1, 2, 3].map((index) => <div key={index} className="h-4 w-full rounded-lg bg-slate-200/50 dark:bg-zinc-800/40" />)}
        </div>
      </div>
    </div>
  );
}
