import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface SectionHeaderProps {
  title: string;
  href?: string;
  linkLabel?: string;
}

export default function SectionHeader({
  title,
  href,
  linkLabel = "Xem tất cả",
}: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6 pb-2 border-b border-slate-100 dark:border-zinc-800/60">
      <div className="flex items-center gap-2.5">
        <span className="w-1.5 h-6 rounded-full bg-gradient-to-b from-blue-500 to-indigo-600 shrink-0 shadow-sm shadow-blue-500/30" />
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          {title}
        </h2>
      </div>

      {href && (
        <Link
          href={href}
          className="flex items-center gap-1 text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400 hover:text-blue-500 transition-colors group py-1 px-3 rounded-full hover:bg-blue-50 dark:hover:bg-blue-950/40"
        >
          <span>{linkLabel}</span>
          <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
        </Link>
      )}
    </div>
  );
}
