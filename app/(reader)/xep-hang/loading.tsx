export default function RankingLoading() {
  return (
    <section role="status" aria-label="Đang tải bảng xếp hạng" className="space-y-8 pb-16 motion-safe:animate-pulse">
      <span className="sr-only">Đang tải bảng xếp hạng…</span>
      <div aria-hidden="true" className="space-y-4">
        <div className="h-4 w-44 rounded-lg bg-slate-200/70 dark:bg-zinc-800/60" />
        <div className="space-y-3 rounded-3xl border border-slate-200/80 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="h-5 w-40 rounded-lg bg-slate-200/70 dark:bg-zinc-800/60" />
          <div className="h-10 w-3/4 rounded-lg bg-slate-200/70 dark:bg-zinc-800/60" />
          <div className="h-4 w-full rounded-lg bg-slate-200/50 dark:bg-zinc-800/40" />
        </div>
        <div className="h-12 w-full rounded-xl bg-slate-200/70 dark:bg-zinc-800/60" />
      </div>
      <div aria-hidden="true" className="grid gap-5 md:grid-cols-3">
        {[0, 1, 2].map((item) => <div key={item} className="flex gap-4 rounded-3xl border border-slate-200/80 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><div className="h-32 w-24 rounded-xl bg-slate-200/70 dark:bg-zinc-800/60" /><div className="flex-1 space-y-3 pt-3"><div className="h-4 w-2/3 rounded bg-slate-200/70 dark:bg-zinc-800/60" /><div className="h-4 w-full rounded bg-slate-200/50 dark:bg-zinc-800/40" /><div className="h-4 w-1/2 rounded bg-slate-200/50 dark:bg-zinc-800/40" /></div></div>)}
      </div>
      <div aria-hidden="true" className="space-y-3 rounded-3xl border border-slate-200/80 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">{[0, 1, 2, 3, 4].map((item) => <div key={item} className="h-12 rounded-lg bg-slate-200/60 dark:bg-zinc-800/50" />)}</div>
    </section>
  );
}
