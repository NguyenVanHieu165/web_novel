import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { permissionsHref, type PermissionFilters } from "./permissions-url";

const number = new Intl.NumberFormat("vi-VN");

export function PermissionsPagination({ page, pageCount, filters, first, last, total }: {
  page: number; pageCount: number; filters: PermissionFilters; first: number; last: number; total: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-3 text-xs sm:px-4 sm:text-sm">
      <p role="status" className="text-muted-foreground tabular-nums">
        {total ? `Đang xem ${number.format(first)}–${number.format(last)} / ${number.format(total)} tài khoản` : "0 tài khoản"}
      </p>
      <Pagination className="mx-0 w-auto"><PaginationContent>
        <PaginationItem>
        {page > 1 ? (
          <Button asChild variant="outline" size="sm"><Link href={permissionsHref(filters, page - 1)} scroll={false}>Trước</Link></Button>
        ) : <Button type="button" variant="outline" size="sm" disabled>Trước</Button>}
        </PaginationItem>
        <PaginationItem><span className="px-2 tabular-nums" aria-current="page">Trang {number.format(page)} / {number.format(pageCount)}</span></PaginationItem>
        <PaginationItem>
        {page < pageCount ? (
          <Button asChild variant="outline" size="sm"><Link href={permissionsHref(filters, page + 1)} scroll={false}>Sau</Link></Button>
        ) : <Button type="button" variant="outline" size="sm" disabled>Sau</Button>}
        </PaginationItem>
      </PaginationContent></Pagination>
    </div>
  );
}
