"use client";

import { Button } from "@/components/ui/button";

export default function PermissionsError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="space-y-3 rounded-xl border border-border bg-card p-5 text-foreground">
      <h2 className="text-lg font-semibold">Không thể tải danh sách phân quyền</h2>
      <p className="text-sm text-muted-foreground">Kiểm tra kết nối rồi thử tải lại trang.</p>
      <Button type="button" variant="outline" onClick={reset}>Thử lại</Button>
    </div>
  );
}
