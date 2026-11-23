"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { ErrorState, ErrorStateActions, ErrorStateDescription, ErrorStateTitle } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";

export default function ReaderError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <ErrorState className="mx-auto my-16 max-w-lg">
      <div><ErrorStateTitle className="text-lg">Chưa thể tải nội dung</ErrorStateTitle><ErrorStateDescription>Kết nối có thể đang gián đoạn. Bạn có thể tải lại và tiếp tục tìm truyện.</ErrorStateDescription>
      <ErrorStateActions>
        <Button type="button" disabled={pending} onClick={() => startTransition(() => { router.refresh(); reset(); })}>
          <RefreshCw className={pending ? "motion-safe:animate-spin" : ""} aria-hidden="true" />{pending ? "Đang tải lại…" : "Thử lại"}
        </Button>
        <Button asChild variant="outline"><Link href="/">Về trang chủ</Link></Button>
      </ErrorStateActions></div>
    </ErrorState>
  );
}
