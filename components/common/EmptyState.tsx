import Link from "next/link";
import { BookX, RefreshCw } from "lucide-react";

interface EmptyStateProps {
  title?: string;
  description?: string;
  resetHref?: string;
  resetLabel?: string;
}

export default function EmptyState({
  title = "Không tìm thấy truyện nào",
  description = "Thử thay đổi từ khóa hoặc điều chỉnh bộ lọc để tìm thêm tác phẩm phù hợp.",
  resetHref,
  resetLabel = "Đặt lại bộ lọc",
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-12 sm:p-16 my-8 rounded-3xl border border-slate-200/80 dark:border-zinc-800/80 bg-white/50 dark:bg-zinc-900/40 backdrop-blur-sm">
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 mb-4 shadow-inner">
        <BookX className="w-8 h-8" />
      </div>
      <h3 className="text-xl font-bold text-slate-800 dark:text-zinc-100 mb-2">
        {title}
      </h3>
      <p className="max-w-md text-sm text-slate-500 dark:text-zinc-400 mb-6">
        {description}
      </p>
      {resetHref && (
        <Link
          href={resetHref}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <RefreshCw className="w-4 h-4" />
          {resetLabel}
        </Link>
      )}
    </div>
  );
}
