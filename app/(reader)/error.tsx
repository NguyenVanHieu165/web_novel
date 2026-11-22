"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";

export default function ReaderError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <section className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-5 px-5 py-16 text-center">
      <h1 className="text-2xl font-bold">Chưa thể tải nội dung</h1>
      <p role="alert" className="text-sm leading-6 opacity-75">Kết nối có thể đang gián đoạn. Bạn có thể tải lại và tiếp tục tìm truyện.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" disabled={pending} onClick={() => startTransition(() => { router.refresh(); reset(); })}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${pending ? "motion-safe:animate-spin" : ""}`} aria-hidden="true" />{pending ? "Đang tải lại…" : "Thử lại"}
        </button>
        <Link href="/" className="rounded-xl border px-5 py-3 text-sm font-semibold hover:bg-blue-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">Về trang chủ</Link>
      </div>
    </section>
  );
}
