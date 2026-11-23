import type { Metadata } from "next";
import Link from "next/link";
import AccountThemeToggle from "@/components/account/AccountThemeToggle";
import DemoTopUpForm from "@/components/account/DemoTopUpForm";
import type { lich_su_giao_dich_loai } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requireReaderPage } from "@/lib/server/reader-page";
import { isDemoTopUpEnabled } from "@/lib/server/reader-wallet";
import { walletPageSchema } from "@/schemas/reader-wallet.schema";
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderTitle } from "@/components/shared/page-header";
import { EmptyState, EmptyStateDescription, EmptyStateTitle } from "@/components/shared/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
function pageHref(page: number) {
  return page === 1 ? "/vi-xu#lich-su-giao-dich" : `/vi-xu?page=${page}#lich-su-giao-dich`;
}

export default async function WalletPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const user = await requireReaderPage("/vi-xu");
  const query = walletPageSchema.safeParse((await searchParams).page);
  const where = { idTaiKhoan: user.idTaiKhoan };
  const [wallet, total] = await Promise.all([
    prisma.viTien.findUnique({ where, select: { soDuXu: true } }),
    prisma.lichSuGiaoDich.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(query.success ? query.data : 1, totalPages);
  const entries = total === 0 ? [] : await prisma.lichSuGiaoDich.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { idLichSuGiaoDich: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: { idLichSuGiaoDich: true, loai: true, createdAt: true, so_xu_thay_doi: true, soDuTruoc: true, soDuSau: true },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader>
        <PageHeaderContent><PageHeaderTitle>Ví Xu</PageHeaderTitle></PageHeaderContent>
        <PageHeaderActions><AccountThemeToggle /></PageHeaderActions>
      </PageHeader>
      <div className="grid gap-5 md:grid-cols-2">
        <Card className="border-primary/25 bg-primary/5">
          <CardHeader><CardTitle id="balance-heading" className="text-sm text-primary">Số dư hiện tại</CardTitle></CardHeader>
          <CardContent aria-labelledby="balance-heading" className="space-y-3">
          <p className="text-3xl font-bold tabular-nums sm:text-4xl">{number.format(wallet?.soDuXu ?? 0)} <span className="text-xl">xu</span></p>
          {!wallet && <Alert variant="info"><AlertDescription>Tài khoản chưa có ví xu.</AlertDescription></Alert>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle id="top-up-heading" className="text-lg">Nạp xu</CardTitle>
          <CardDescription>{isDemoTopUpEnabled() ? "Nạp xu mô phỏng để thử mở khóa chương VIP." : "Nạp xu chưa khả dụng."}</CardDescription></CardHeader>
          <CardContent aria-labelledby="top-up-heading">
          {isDemoTopUpEnabled() ? (
            <DemoTopUpForm key={user.idTaiKhoan} />
          ) : null}
          </CardContent>
        </Card>
      </div>
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
                  <p className="font-medium">{transactionLabels[entry.loai]}</p>
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
            {page > 1 && <PaginationItem><PaginationLink asChild size="default"><Link href={pageHref(page - 1)} prefetch={false}>Trang trước</Link></PaginationLink></PaginationItem>}
            <PaginationItem><span aria-current="page" className="px-3 text-sm tabular-nums">Trang {page} / {totalPages}</span></PaginationItem>
            {page < totalPages && <PaginationItem><PaginationLink asChild size="default"><Link href={pageHref(page + 1)} prefetch={false}>Trang sau</Link></PaginationLink></PaginationItem>}
          </PaginationContent></Pagination>
        )}
        </CardContent>
      </Card>
    </div>
  );
}
