import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { permissionsHref, type PermissionFilters } from "./permissions-url";

const number = new Intl.NumberFormat("vi-VN");
const button = cn(buttonVariants({ variant: "outline", size: "sm" }), "min-h-9 touch-manipulation");

export function PermissionsPagination({ page, pageCount, filters, first, last, total }: {
  page: number; pageCount: number; filters: PermissionFilters; first: number; last: number; total: number;
}) {
  return (
    <nav aria-label="Phân trang tài khoản" className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-3 text-xs sm:px-4 sm:text-sm">
      <p role="status" className="text-muted-foreground tabular-nums">
        {total ? `Đang xem ${number.format(first)}–${number.format(last)} / ${number.format(total)} tài khoản` : "0 tài khoản"}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {page > 1 ? (
          <Link href={permissionsHref(filters, page - 1)} scroll={false} className={button}>
            <ChevronLeft aria-hidden="true" /> Trước
          </Link>
        ) : <button type="button" className={button} disabled><ChevronLeft aria-hidden="true" /> Trước</button>}
        <span className="tabular-nums" aria-current="page">Trang {number.format(page)} / {number.format(pageCount)}</span>
        {page < pageCount ? (
          <Link href={permissionsHref(filters, page + 1)} scroll={false} className={button}>
            Sau <ChevronRight aria-hidden="true" />
          </Link>
        ) : <button type="button" className={button} disabled>Sau <ChevronRight aria-hidden="true" /></button>}
      </div>
    </nav>
  );
}
