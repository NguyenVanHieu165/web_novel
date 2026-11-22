const block = "rounded-lg bg-slate-200/70 dark:bg-zinc-800/60";

export function StoryCardGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="space-y-3">
          <div className={`aspect-[3/4] w-full !rounded-2xl ${block}`} />
          <div className={`h-4 w-3/4 ${block}`} />
          <div className={`h-3 w-1/2 ${block}`} />
        </div>
      ))}
    </div>
  );
}

export default function StoryListSkeleton({ variant }: { variant: "search" | "latest" }) {
  return (
    <div role="status" className="space-y-8 pb-16 motion-safe:animate-pulse">
      <span className="sr-only">{variant === "search" ? "Đang tải kết quả tìm kiếm…" : "Đang tải truyện mới…"}</span>
      <div aria-hidden="true" className="space-y-4">
        <div className={`h-4 w-48 ${block}`} />
        <div className={`space-y-3 ${variant === "search" ? "mx-auto flex max-w-xl flex-col items-center" : "border-b border-slate-200/80 pb-4 dark:border-zinc-800/80"}`}>
          <div className={`h-6 w-36 ${block}`} />
          <div className={`h-9 w-3/4 ${block}`} />
          <div className={`h-4 w-full ${block}`} />
        </div>
        <div className={`h-12 w-full !rounded-xl ${block}`} />
        {variant === "search" && <div className={`h-16 w-full ${block}`} />}
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className={`h-8 w-3/4 ${block}`} />
          <div className={`h-16 w-full ${block}`} />
        </div>
        <div className={`h-5 w-52 ${block}`} />
      </div>
      <StoryCardGridSkeleton count={20} />
    </div>
  );
}
