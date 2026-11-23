import type { Metadata } from "next";
import Link from "next/link";
import AccountThemeToggle from "@/components/account/AccountThemeToggle";
import WalletTopUp from "@/components/account/WalletTopUp";
import type { lich_su_giao_dich_loai } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requireReaderPage } from "@/lib/server/reader-page";
import { topUpPackages } from "@/lib/server/topup-packages";
import { walletPageSchema } from "@/schemas/reader-wallet.schema";
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/shared/page-header";
import { EmptyState, EmptyStateDescription, EmptyStateTitle } from "@/components/shared/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from "@/components/ui/pagination";

export const metadata: Metadata = {
  title: "Ví xu và lịch sử giao dịch | WebNovel",
  robots: { index: false, follow: false },
};

const pageSize = 12;
const number = new Intl.NumberFormat("vi-VN");
const date = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
});
const transactionLabels: Record<lich_su_giao_dich_loai, string> = {
  nap_xu: "Nạp xu",
  mua_chuong: "Mua chương VIP",
  donate: "Tặng thưởng",
  hoan_xu: "Hoàn xu",
  khuyen_mai: "Khuyến mãi",
  rut_tien: "Rút tiền",
};

function transactionLabel(type: lich_su_giao_dich_loai, amount: number) {
  return type === "mua_chuong" && amount > 0 ? "Doanh thu chương" : transactionLabels[type];
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(page: number, cursor: number, direction: "next" | "prev") {
  const query = new URLSearchParams({ page: String(page), cursor: String(cursor), direction });
  return `/vi-xu?${query.toString()}#lich-su-giao-dich`;
}

type WalletSearchParams = {
  page?: string | string[];
  cursor?: string | string[];
  direction?: string | string[];
};

export default async function WalletPage({ searchParams }: { searchParams: Promise<WalletSearchParams> }) {
  const user = await requireReaderPage("/vi-xu");
  const rawSearch = await searchParams;
  const pageQuery = walletPageSchema.safeParse(firstParam(rawSearch.page));
  const cursorQuery = walletPageSchema.safeParse(firstParam(rawSearch.cursor));
  const direction = firstParam(rawSearch.direction) === "prev" ? "prev" : "next";
  const where = { idTaiKhoan: user.idTaiKhoan };
  const [wallet, total] = await Promise.all([
    prisma.viTien.findUnique({ where, select: { soDuXu: true } }),
    prisma.lichSuGiaoDich.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pageQuery.success ? pageQuery.data : 1, totalPages);
  const select = { idLichSuGiaoDich: true, loai: true, createdAt: true, so_xu_thay_doi: true, soDuTruoc: true, soDuSau: true } as const;
  const rows = total === 0
    ? []
    : cursorQuery.success
      ? await prisma.lichSuGiaoDich.findMany({
          where: {
            ...where,
            idLichSuGiaoDich: direction === "prev" ? { gt: cursorQuery.data } : { lt: cursorQuery.data },
          },
          orderBy: { idLichSuGiaoDich: direction === "prev" ? "asc" : "desc" },
          take: pageSize + 1,
          select,
        })
      : await prisma.lichSuGiaoDich.findMany({
          where,
          orderBy: { idLichSuGiaoDich: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select,
        });
  if (cursorQuery.success && rows.length > pageSize) rows.pop();
  const entries = direction === "prev" && cursorQuery.success ? rows.reverse() : rows;
  const firstEntry = entries[0];
  const lastEntry = entries.at(-1);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Ví Xu</PageHeaderTitle>
          <PageHeaderDescription>Quản lý số dư, nạp xu và theo dõi toàn bộ giao dịch của bạn.</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions><AccountThemeToggle /></PageHeaderActions>
      </PageHeader>

      <Card className="border-primary/25 bg-primary/5">
        <CardHeader>
          <CardTitle id="balance-heading" className="text-sm text-primary">Số Dư Hiện Tại</CardTitle>
          <CardDescription>Số xu khả dụng để mở khóa chương và sử dụng các tính năng trả phí.</CardDescription>
        </CardHeader>
        <CardContent aria-labelledby="balance-heading" className="space-y-3">
          <p className="text-3xl font-bold tabular-nums sm:text-4xl">{number.format(wallet?.soDuXu ?? 0)} <span className="text-xl">xu</span></p>
          {!wallet && <Alert variant="info"><AlertDescription>Tài khoản chưa có ví xu.</AlertDescription></Alert>}
        </CardContent>
      </Card>

      <WalletTopUp key={user.idTaiKhoan} packages={Object.values(topUpPackages)} />

      <Card>
        <CardHeader className="flex-row flex-wrap items-baseline justify-between gap-2">
          <CardTitle id="lich-su-giao-dich" className="scroll-mt-24 text-lg">Lịch sử giao dịch</CardTitle>
          <CardDescription>{number.format(total)} giao dịch</CardDescription>
        </CardHeader>
        <CardContent aria-labelledby="lich-su-giao-dich" className="space-y-4">
        {entries.length === 0 ? (
          <EmptyState className="min-h-36 py-6"><EmptyStateTitle>Chưa có giao dịch</EmptyStateTitle><EmptyStateDescription>Lịch sử nạp và sử dụng xu sẽ xuất hiện tại đây.</EmptyStateDescription></EmptyState>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-zinc-800">
            {entries.map((entry) => (
              <li key={entry.idLichSuGiaoDich} className="grid gap-2 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="space-y-1">
                  <Badge variant={entry.so_xu_thay_doi < 0 ? "warning" : "success"}>{transactionLabel(entry.loai, entry.so_xu_thay_doi)}</Badge>
                  {entry.createdAt && <time className="text-muted-foreground"
                    dateTime={entry.createdAt.toISOString()}>{date.format(entry.createdAt)}</time>}
                </div>
                <div className="space-y-1 tabular-nums sm:text-right">
                  <p className={entry.so_xu_thay_doi < 0
                    ? "font-semibold text-destructive"
                    : "font-semibold text-success"}>
                    {entry.so_xu_thay_doi > 0 ? "+" : ""}{number.format(entry.so_xu_thay_doi)} xu
                  </p>
                  <p className="text-muted-foreground">Số dư {number.format(entry.soDuTruoc)} → {number.format(entry.soDuSau)} xu</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {totalPages > 1 && (
          <Pagination aria-label="Phân trang giao dịch"><PaginationContent>
            {page > 1 && firstEntry && <PaginationItem><PaginationLink asChild size="default"><Link href={pageHref(page - 1, firstEntry.idLichSuGiaoDich, "prev")} prefetch={false}>Trang trước</Link></PaginationLink></PaginationItem>}
            <PaginationItem><span aria-current="page" className="px-3 text-sm tabular-nums">Trang {page} / {totalPages}</span></PaginationItem>
            {page < totalPages && lastEntry && <PaginationItem><PaginationLink asChild size="default"><Link href={pageHref(page + 1, lastEntry.idLichSuGiaoDich, "next")} prefetch={false}>Trang sau</Link></PaginationLink></PaginationItem>}
          </PaginationContent></Pagination>
        )}
        </CardContent>
      </Card>
    </div>
  );
}
