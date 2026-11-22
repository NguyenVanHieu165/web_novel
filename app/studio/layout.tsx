import Link from "next/link";
import { BookOpen, PenLine } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { requireStudioUser } from "./session";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStudioUser();
  return <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-zinc-950 dark:text-zinc-100" style={{ fontFamily: "var(--font-reader-sans), system-ui, sans-serif" }}>
    <a href="#studio-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:p-3 focus:text-slate-900">Đến nội dung sáng tác</a>
    <header className="border-b bg-white dark:border-zinc-800 dark:bg-zinc-900"><nav aria-label="Điều hướng sáng tác" className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6"><Link href="/studio" className="flex items-center gap-2 rounded-md font-semibold focus-visible:outline-2"><PenLine aria-hidden className="size-5 text-sky-600" /> Khu vực sáng tác</Link><div className="flex items-center gap-4 text-sm"><span className="max-w-36 truncate text-slate-500">{user.tenTaiKhoan}</span><Link href="/" className="flex items-center gap-2 rounded-md hover:text-sky-600 focus-visible:outline-2"><BookOpen aria-hidden className="size-4" /> Về trang đọc</Link></div></nav></header>
    <main id="studio-main" className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6">{children}</main>
    <Toaster richColors position="top-center" />
  </div>;
}
