"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { BookOpen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
        <Alert role="alert" className="border-[var(--reader-border)] bg-[var(--reader-surface)] text-left text-[var(--reader-text)]"><AlertDescription>Kết nối có thể đang gián đoạn. Bạn có thể thử lại hoặc quay về trang truyện.</AlertDescription></Alert>
        <div className="flex flex-wrap justify-center gap-3">
          <Button
            type="button" onClick={() => startTransition(() => { router.refresh(); reset(); })} disabled={pending}
            className="rounded-xl bg-[var(--reader-accent,#2563eb)] px-5 text-sm font-bold text-white hover:bg-[var(--reader-accent,#2563eb)] hover:opacity-90 focus-visible:border-[var(--reader-accent,#2563eb)] focus-visible:ring-[var(--reader-accent,#2563eb)]/40 disabled:cursor-wait disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${pending ? "motion-safe:animate-spin" : ""}`} aria-hidden="true" />{pending ? "Đang tải lại…" : "Thử lại"}
          </Button>
          <Button asChild variant="outline" className="rounded-xl border-[var(--reader-border)] bg-transparent px-5 text-sm font-semibold text-[var(--reader-text)] hover:bg-[var(--reader-surface)] hover:text-[var(--reader-text)] focus-visible:border-[var(--reader-accent,#2563eb)] focus-visible:ring-[var(--reader-accent,#2563eb)]/40"><Link href={storyPath} prefetch={false}>Về trang truyện</Link></Button>
        </div>
      </div>
    </section>
  );
}
