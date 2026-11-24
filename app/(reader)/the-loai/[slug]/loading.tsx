import { StoryCardGridSkeleton } from "@/components/common/StoryListSkeleton";

export default function GenreLoading() {
  return (
    <section role="status" aria-label="Đang tải truyện theo thể loại" className="space-y-8 pb-16 motion-safe:animate-pulse">
      <span className="sr-only">Đang tải truyện theo thể loại…</span>
      <div aria-hidden="true" className="space-y-4">
        <div className="h-4 w-48 rounded-lg bg-slate-200/70 dark:bg-zinc-800/60" />
        <div className="space-y-3 border-b border-slate-200/80 pb-5 dark:border-zinc-800/80">
          <div className="h-5 w-36 rounded-lg bg-slate-200/70 dark:bg-zinc-800/60" />
          <div className="h-9 w-2/3 rounded-lg bg-slate-200/70 dark:bg-zinc-800/60" />
          <div className="h-4 w-full rounded-lg bg-slate-200/50 dark:bg-zinc-800/40" />
        </div>
        <div className="h-12 w-full rounded-xl bg-slate-200/70 dark:bg-zinc-800/60" />
        <div className="h-16 w-full rounded-xl bg-slate-200/50 dark:bg-zinc-800/40" />
        <div className="h-5 w-52 rounded-lg bg-slate-200/70 dark:bg-zinc-800/60" />
      </div>
      <StoryCardGridSkeleton count={20} />
    </section>
  );
}
