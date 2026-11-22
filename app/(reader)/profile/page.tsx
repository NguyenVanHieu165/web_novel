import type { Metadata } from "next";
import AccountThemeToggle from "@/components/account/AccountThemeToggle";
import { ProfileForm, PasswordForm } from "@/components/account/ReaderProfileForms";
import { prisma } from "@/lib/prisma";
import { requireReaderPage } from "@/lib/server/reader-page";

export const metadata: Metadata = {
  title: "Hồ sơ và bảo mật | WebNovel",
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const user = await requireReaderPage("/profile");
  const profile = await prisma.hoSoCaNhan.findUnique({
    where: { idTaiKhoan: user.idTaiKhoan },
    select: { ho_ten: true, anh: true },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Hồ sơ và bảo mật</h1>
          <p className="wrap-break-word text-sm text-slate-600 dark:text-zinc-400">
            {user.tenTaiKhoan} · {user.email}
          </p>
        </div>
        <AccountThemeToggle />
      </header>
      <div className="grid items-start gap-5 md:grid-cols-2">
        <section aria-labelledby="profile-heading"
          className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
          <h2 id="profile-heading" className="scroll-mt-24 text-lg font-semibold">Thông tin cá nhân</h2>
          <ProfileForm key={user.idTaiKhoan} initial={{ displayName: profile?.ho_ten ?? user.tenTaiKhoan, avatar: profile?.anh ?? "" }} />
        </section>
        <section aria-labelledby="password-heading"
          className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
          <h2 id="password-heading" className="scroll-mt-24 text-lg font-semibold">Đổi mật khẩu</h2>
          <PasswordForm key={user.idTaiKhoan} />
        </section>
      </div>
    </div>
  );
}
