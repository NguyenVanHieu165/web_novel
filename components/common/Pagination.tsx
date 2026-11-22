"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useStorySearchNavigation } from "@/components/search/StorySearchProvider";
import { storySearchHref } from "@/lib/story-search";

interface PaginationProps { currentPage: number; totalPages: number }
const linkClass = "inline-flex min-h-10 min-w-10 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-blue-500 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-blue-400";

export default function Pagination({ currentPage, totalPages }: PaginationProps) {
  const pathname = usePathname();
  const { search, pending, controller } = useStorySearchNavigation();
  if (totalPages <= 1) return null;
  const page = Math.max(1, Math.min(currentPage, totalPages));
  const pages: number[] = [1];
  const start = Math.max(2, page - 2);
  const end = Math.min(totalPages - 1, page + 2);
  if (start > 2) pages.push(-1);
  for (let index = start; index <= end; index += 1) pages.push(index);
  if (end < totalPages - 1) pages.push(-2);
  pages.push(totalPages);

  const onNavigate = (event: MouseEvent<HTMLAnchorElement>, destination: number) => {
    if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    if (!pending) controller.update({ page: destination }, { resetPage: false });
  };
  const href = (destination: number) => {
    // Use the coordinator's complete query: changing page must preserve every filter.
    const params = new URLSearchParams(search);
    if (destination === 1) params.delete("page"); else params.set("page", String(destination));
    return storySearchHref(pathname, params);
  };
  const disabled = "inline-flex min-h-10 items-center gap-1 rounded-xl border border-slate-100 px-3 py-2 text-sm text-slate-400 dark:border-zinc-800/60 dark:text-zinc-600";

  return (
    <nav aria-label="Phân trang truyện" aria-busy={pending} className="my-10 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
      {page > 1 ? <Link href={href(page - 1)} prefetch={false} aria-label="Trang trước" aria-disabled={pending} onClick={(event) => onNavigate(event, page - 1)} className={linkClass}><ChevronLeft className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Trước</span></Link>
        : <span aria-disabled="true" className={disabled}><ChevronLeft className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Trước</span></span>}
      {pages.map((number) => number < 0 ? <span key={number} aria-hidden="true" className="px-1 text-slate-400">…</span> : number === page
        ? <span key={number} aria-current="page" aria-label={`Trang ${number}`} className="inline-flex h-10 min-w-10 items-center justify-center rounded-xl bg-blue-600 px-3 text-sm font-bold text-white tabular-nums">{number}</span>
        : <Link key={number} href={href(number)} prefetch={false} aria-label={`Trang ${number}`} aria-disabled={pending} onClick={(event) => onNavigate(event, number)} className={linkClass}>{number}</Link>)}
      {page < totalPages ? <Link href={href(page + 1)} prefetch={false} aria-label="Trang sau" aria-disabled={pending} onClick={(event) => onNavigate(event, page + 1)} className={linkClass}><span className="hidden sm:inline">Sau</span><ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
        : <span aria-disabled="true" className={disabled}><span className="hidden sm:inline">Sau</span><ChevronRight className="h-4 w-4" aria-hidden="true" /></span>}
    </nav>
  );
}
