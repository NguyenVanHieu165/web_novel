"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { BookOpen, RefreshCw } from "lucide-react";

export default function ChapterError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const storyPath = typeof params.slug === "string" ? `/truyen/${encodeURIComponent(params.slug)}` : "/";

  return (
    <section
      className="flex min-h-[60vh] items-center justify-center rounded-2xl px-5 py-12"
      style={{ backgroundColor: "var(--reader-bg, #fcfbf9)", color: "var(--reader-text, #1e293b)" }}
    >
      <div className="max-w-md space-y-4 text-center">
        <BookOpen className="mx-auto h-10 w-10 text-blue-500" aria-hidden="true" />
        <h1 className="text-xl font-bold">Chưa thể tải chương</h1>
        <p className="text-sm leading-6 opacity-75" role="alert">Kết nối có thể đang gián đoạn. Bạn có thể thử lại hoặc quay về trang truyện.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button" onClick={() => startTransition(() => { router.refresh(); reset(); })} disabled={pending}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${pending ? "motion-safe:animate-spin" : ""}`} aria-hidden="true" />{pending ? "Đang tải lại…" : "Thử lại"}
          </button>
          <Link href={storyPath} prefetch={false} className="rounded-xl border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">Về trang truyện</Link>
        </div>
      </div>
    </section>
  );
}
