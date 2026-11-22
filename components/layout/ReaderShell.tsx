"use client";

import { usePathname } from "next/navigation";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ReadingDock from "@/components/home/ReadingDock";
import ScrollProgressButton from "@/components/common/ScrollProgressButton";
import ChapterChrome from "./ChapterChrome";

export default function ReaderShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChapter = /^\/truyen\/[^/]+\/[^/]+\/?$/.test(pathname);

  if (isChapter) {
    return <ChapterChrome key={pathname} header={<Header />}>{children}</ChapterChrome>;
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-zinc-950 dark:text-zinc-50">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      <Footer />
      <ReadingDock />
      <ScrollProgressButton />
    </div>
  );
}
