"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ReadingDock from "@/components/home/ReadingDock";
import ScrollProgressButton from "@/components/common/ScrollProgressButton";
import { isChapterPath } from "@/lib/reader-navigation";
import ChapterChrome from "./ChapterChrome";

export default function ReaderShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const isChapter = isChapterPath(pathname);

  useEffect(() => {
    const previous = previousPathname.current;
    previousPathname.current = pathname;

    if (previous !== pathname && isChapterPath(previous) && isChapter) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }, [isChapter, pathname]);

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
