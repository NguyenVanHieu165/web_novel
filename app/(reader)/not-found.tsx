import Link from "next/link";
import { BookX } from "lucide-react";
import { EmptyState, EmptyStateActions, EmptyStateDescription, EmptyStateIcon, EmptyStateTitle } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export default function ReaderNotFound() {
  return (
    <EmptyState className="mx-auto min-h-[60vh] max-w-lg border-0 bg-transparent">
      <EmptyStateIcon className="size-16 bg-primary/10 text-primary [&>svg]:size-8"><BookX aria-hidden="true" /></EmptyStateIcon>
      <EmptyStateTitle className="text-2xl">Không tìm thấy nội dung</EmptyStateTitle>
      <EmptyStateDescription>Truyện hoặc chương bạn tìm có thể đã được chuyển hoặc gỡ bỏ. Hãy thử tìm lại bằng tên truyện.</EmptyStateDescription>
      <EmptyStateActions><Button asChild><Link href="/tim-kiem">Tìm truyện</Link></Button><Button asChild variant="outline"><Link href="/">Về trang chủ</Link></Button></EmptyStateActions>
    </EmptyState>
  );
}
