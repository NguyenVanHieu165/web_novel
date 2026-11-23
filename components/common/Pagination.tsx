"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useStorySearchNavigation } from "@/components/search/StorySearchProvider";
import {
  Pagination as PaginationRoot,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";
import { storySearchHref } from "@/lib/story-search";

interface PaginationProps { currentPage: number; totalPages: number }

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
  return (
    <PaginationRoot aria-label="Phân trang truyện" aria-busy={pending} className="my-10">
      <PaginationContent className="flex-wrap gap-1.5 sm:gap-2">
        <PaginationItem>
          <PaginationLink asChild size="default">
            {page > 1 ? (
              <Link
                href={href(page - 1)}
                prefetch={false}
                aria-label="Trang trước"
                aria-disabled={pending}
                onClick={(event) => onNavigate(event, page - 1)}
              >
                <ChevronLeft aria-hidden="true" />
                <span className="hidden sm:inline">Trước</span>
              </Link>
            ) : (
              <span aria-label="Trang trước" aria-disabled="true">
                <ChevronLeft aria-hidden="true" />
                <span className="hidden sm:inline">Trước</span>
              </span>
            )}
          </PaginationLink>
        </PaginationItem>

        {pages.map((number) =>
          number < 0 ? (
            <PaginationItem key={number}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={number}>
              <PaginationLink asChild isActive={number === page}>
                {number === page ? (
                  <span aria-label={`Trang ${number}`} className="tabular-nums">
                    {number}
                  </span>
                ) : (
                  <Link
                    href={href(number)}
                    prefetch={false}
                    aria-label={`Trang ${number}`}
                    aria-disabled={pending}
                    onClick={(event) => onNavigate(event, number)}
                    className="tabular-nums"
                  >
                    {number}
                  </Link>
                )}
              </PaginationLink>
            </PaginationItem>
          )
        )}

        <PaginationItem>
          <PaginationLink asChild size="default">
            {page < totalPages ? (
              <Link
                href={href(page + 1)}
                prefetch={false}
                aria-label="Trang sau"
                aria-disabled={pending}
                onClick={(event) => onNavigate(event, page + 1)}
              >
                <span className="hidden sm:inline">Sau</span>
                <ChevronRight aria-hidden="true" />
              </Link>
            ) : (
              <span aria-label="Trang sau" aria-disabled="true">
                <span className="hidden sm:inline">Sau</span>
                <ChevronRight aria-hidden="true" />
              </span>
            )}
          </PaginationLink>
        </PaginationItem>
      </PaginationContent>
    </PaginationRoot>
  );
}
