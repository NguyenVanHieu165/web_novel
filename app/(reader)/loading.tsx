export default function ReaderLoading() {
  return (
    <div className="space-y-8 animate-pulse pb-16">
      {/* Header skeleton */}
      <div className="h-44 sm:h-52 w-full rounded-3xl bg-slate-200/70 dark:bg-zinc-800/60" />

      {/* Filter skeleton */}
      <div className="h-16 w-full rounded-2xl bg-slate-200/60 dark:bg-zinc-800/40" />

      {/* Grid skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
        {Array.from({ length: 15 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="aspect-[2/3] w-full rounded-2xl bg-slate-200/70 dark:bg-zinc-800/60" />
            <div className="h-4 w-3/4 rounded-lg bg-slate-200/70 dark:bg-zinc-800/60" />
            <div className="h-3 w-1/2 rounded-lg bg-slate-200/50 dark:bg-zinc-800/40" />
          </div>
        ))}
      </div>
    </div>
  );
}
