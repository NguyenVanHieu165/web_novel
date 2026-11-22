import type { Metadata } from "next";
import Link from "next/link";
import AccountThemeToggle from "@/components/account/AccountThemeToggle";
import DemoTopUpForm from "@/components/account/DemoTopUpForm";
import type { lich_su_giao_dich_loai } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requireReaderPage } from "@/lib/server/reader-page";
import { isDemoTopUpEnabled } from "@/lib/server/reader-wallet";
import { walletPageSchema } from "@/schemas/reader-wallet.schema";

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
const navClass = "inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-zinc-700 dark:hover:bg-zinc-800";

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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Ví xu</h1>
        <AccountThemeToggle />
      </header>
      <div className="grid gap-5 md:grid-cols-2">
        <section aria-labelledby="balance-heading"
          className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900 dark:bg-blue-950/40 sm:p-6">
          <h2 id="balance-heading" className="text-sm font-semibold text-blue-900 dark:text-blue-200">Số dư hiện tại</h2>
          <p className="text-3xl font-bold tabular-nums sm:text-4xl">{number.format(wallet?.soDuXu ?? 0)} <span className="text-xl">xu</span></p>
          {!wallet && <p className="text-sm text-slate-700 dark:text-zinc-300">Tài khoản chưa có ví xu.</p>}
        </section>
        <section aria-labelledby="top-up-heading"
          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
          <h2 id="top-up-heading" className="text-lg font-semibold">Nạp xu</h2>
          {isDemoTopUpEnabled() ? (
            <>
              <p className="text-sm text-slate-600 dark:text-zinc-400">Nạp xu mô phỏng để thử mở khóa chương VIP.</p>
              <DemoTopUpForm key={user.idTaiKhoan} />
            </>
          ) : (
            <p className="text-sm text-slate-600 dark:text-zinc-400">Nạp xu chưa khả dụng.</p>
          )}
        </section>
      </div>
      <section aria-labelledby="lich-su-giao-dich"
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="lich-su-giao-dich" className="scroll-mt-24 text-lg font-semibold">Lịch sử giao dịch</h2>
          <p className="text-sm text-slate-600 dark:text-zinc-400">{number.format(total)} giao dịch</p>
        </div>
        {entries.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-600 dark:bg-zinc-950 dark:text-zinc-400">Chưa có giao dịch để hiển thị.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-zinc-800">
            {entries.map((entry) => (
              <li key={entry.idLichSuGiaoDich} className="grid gap-2 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="space-y-1">
                  <p className="font-medium">{transactionLabels[entry.loai]}</p>
                  {entry.createdAt && <time className="text-slate-600 dark:text-zinc-400"
                    dateTime={entry.createdAt.toISOString()}>{date.format(entry.createdAt)}</time>}
                </div>
                <div className="space-y-1 tabular-nums sm:text-right">
                  <p className={entry.so_xu_thay_doi < 0
                    ? "font-semibold text-red-700 dark:text-red-400"
                    : "font-semibold text-emerald-700 dark:text-emerald-400"}>
                    {entry.so_xu_thay_doi > 0 ? "+" : ""}{number.format(entry.so_xu_thay_doi)} xu
                  </p>
                  <p className="text-slate-600 dark:text-zinc-400">Số dư {number.format(entry.soDuTruoc)} → {number.format(entry.soDuSau)} xu</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {totalPages > 1 && (
          <nav aria-label="Phân trang giao dịch" className="flex flex-wrap items-center justify-center gap-3">
            {page > 1 && <Link href={pageHref(page - 1)} prefetch={false} className={navClass}>Trang trước</Link>}
            <span aria-current="page" className="text-sm tabular-nums">Trang {page} / {totalPages}</span>
            {page < totalPages && <Link href={pageHref(page + 1)} prefetch={false} className={navClass}>Trang sau</Link>}
          </nav>
        )}
      </section>
    </div>
  );
}
