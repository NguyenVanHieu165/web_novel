import Link from "next/link";
import { BookX, RefreshCw } from "lucide-react";
import {
  EmptyState as EmptyStateRoot,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  title?: string;
  description?: string;
  resetHref?: string;
  resetLabel?: string;
}

export default function EmptyState({
  title = "Không tìm thấy truyện nào",
  description = "Thử thay đổi từ khóa hoặc điều chỉnh bộ lọc để tìm thêm tác phẩm phù hợp.",
  resetHref,
  resetLabel = "Đặt lại bộ lọc",
}: EmptyStateProps) {
  return (
    <EmptyStateRoot className="my-8 min-h-72 rounded-3xl bg-card/60 backdrop-blur-sm">
      <EmptyStateIcon className="size-16 rounded-2xl bg-primary/10 text-primary shadow-inner [&>svg]:size-8">
        <BookX aria-hidden="true" />
      </EmptyStateIcon>
      <EmptyStateTitle className="text-xl">{title}</EmptyStateTitle>
      <EmptyStateDescription>{description}</EmptyStateDescription>
      {resetHref && (
        <EmptyStateActions>
          <Button asChild>
            <Link href={resetHref}>
              <RefreshCw aria-hidden="true" />
              {resetLabel}
            </Link>
          </Button>
        </EmptyStateActions>
      )}
    </EmptyStateRoot>
  );
}
