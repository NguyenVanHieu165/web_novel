import type { Metadata } from "next";
import AccountThemeToggle from "@/components/account/AccountThemeToggle";
import { ProfileForm, PasswordForm } from "@/components/account/ReaderProfileForms";
import { prisma } from "@/lib/prisma";
import { requireReaderPage } from "@/lib/server/reader-page";
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Hồ Sơ & Bảo Mật</PageHeaderTitle>
          <PageHeaderDescription className="wrap-break-word">
            {user.tenTaiKhoan} · {user.email}
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions><AccountThemeToggle /></PageHeaderActions>
      </PageHeader>
      <div className="grid items-start gap-5 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle id="profile-heading" className="scroll-mt-24 text-lg">Thông tin cá nhân</CardTitle></CardHeader>
          <CardContent aria-labelledby="profile-heading">
          <ProfileForm key={user.idTaiKhoan} initial={{ displayName: profile?.ho_ten ?? user.tenTaiKhoan, avatar: profile?.anh ?? "" }} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle id="password-heading" className="scroll-mt-24 text-lg">Đổi mật khẩu</CardTitle></CardHeader>
          <CardContent aria-labelledby="password-heading">
          <PasswordForm key={user.idTaiKhoan} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
