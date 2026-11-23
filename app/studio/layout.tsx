import Link from "next/link";
import { BookOpen, PenLine } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { requireStudioUser } from "./session";
import { Button } from "@/components/ui/button";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStudioUser();
  return <div className="min-h-screen bg-background text-foreground" style={{ fontFamily: "var(--font-reader-sans), system-ui, sans-serif" }}>
    <a href="#studio-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-background focus:p-3 focus:text-foreground focus:shadow">Đến nội dung sáng tác</a>
    <header className="border-b bg-card text-card-foreground"><nav aria-label="Điều hướng sáng tác" className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6"><Button asChild variant="ghost" className="font-semibold"><Link href="/studio"><PenLine aria-hidden="true" /> Khu vực sáng tác</Link></Button><div className="flex items-center gap-2 text-sm"><span className="max-w-36 truncate text-muted-foreground">{user.tenTaiKhoan}</span><Button asChild variant="outline" size="sm"><Link href="/"><BookOpen aria-hidden="true" /> Về trang đọc</Link></Button></div></nav></header>
    <main id="studio-main" className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6">{children}</main>
    <Toaster richColors position="top-center" />
  </div>;
}
