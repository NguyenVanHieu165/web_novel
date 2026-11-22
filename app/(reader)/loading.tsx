import { StoryCardGridSkeleton } from "@/components/common/StoryListSkeleton";

export default function ReaderLoading() {
  return (
    <div role="status" className="space-y-16 pb-16 motion-safe:animate-pulse">
      <span className="sr-only">Đang tải trang chủ…</span>
      <div aria-hidden="true" className="h-[440px] w-full rounded-3xl bg-slate-200/70 dark:bg-zinc-800/60 sm:h-[490px] md:h-[550px]" />
      <div className="space-y-6">
        <div aria-hidden="true" className="h-7 w-48 rounded-lg bg-slate-200/70 dark:bg-zinc-800/60" />
        <StoryCardGridSkeleton />
      </div>
    </div>
  );
}
