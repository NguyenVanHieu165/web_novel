"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Coins, Search, XCircle } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, EmptyStateDescription, EmptyStateIcon, EmptyStateTitle } from "@/components/shared/empty-state";
import { ErrorState, ErrorStateActions, ErrorStateDescription, ErrorStateTitle } from "@/components/shared/error-state";
import { FilterBar, FilterBarActions, FilterBarGroup } from "@/components/shared/filter-bar";
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AdminTopUpItem, AdminTopUpListResponse, AdminTopUpStatus } from "@/lib/admin-topup-types";

type StatusFilter = "all" | AdminTopUpStatus;
type PendingAction = { order: AdminTopUpItem; action: "approve" | "cancel" };

const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("vi-VN");
const dateTime = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });

const statusPresentation: Record<AdminTopUpStatus, { label: string; variant: "warning" | "success" | "destructive" | "secondary" }> = {
  pending: { label: "Đang chờ", variant: "warning" },
  success: { label: "Thành công", variant: "success" },
  failed: { label: "Thất bại", variant: "destructive" },
  cancelled: { label: "Đã hủy", variant: "secondary" },
};

function readError(payload: unknown, fallback: string) {
  return typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string"
    ? payload.message
    : fallback;
}

export default function AdminTopUpsPage() {
  const [orders, setOrders] = useState<AdminTopUpItem[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPage: 1 });
  const [query, setQuery] = useState<{ page: number; status: StatusFilter; search: string }>({ page: 1, status: "all", search: "" });
  const [searchDraft, setSearchDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchOrders = useCallback(async (signal: AbortSignal) => {
    await Promise.resolve();
    if (signal.aborted) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(query.page),
      limit: String(meta.limit),
      status: query.status,
      search: query.search,
    });

    try {
      const response = await fetch(`/api/admin/topups?${params}`, { signal, cache: "no-store" });
      const payload = await response.json().catch(() => null) as AdminTopUpListResponse | null;
      if (!response.ok || !payload?.success) throw new Error(readError(payload, "Không thể tải danh sách nạp xu."));
      setOrders(payload.data);
      setMeta(payload.meta);
    } catch (requestError) {
      if (signal.aborted) return;
      setError(requestError instanceof Error ? requestError.message : "Không thể tải danh sách nạp xu.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [meta.limit, query]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void fetchOrders(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fetchOrders, refreshKey]);

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQuery((current) => ({ ...current, page: 1, search: searchDraft.trim() }));
  };

  const runAction = async () => {
    if (!pendingAction || submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/topups/${pendingAction.order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: pendingAction.action }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readError(payload, "Không thể cập nhật đơn nạp."));
      toast.success(pendingAction.action === "approve" ? "Đã duyệt và cộng xu cho người dùng" : "Đã hủy đơn nạp");
      setPendingAction(null);
      setRefreshKey((value) => value + 1);
    } catch (actionError) {
      toast.error(actionError instanceof Error ? actionError.message : "Không thể cập nhật đơn nạp.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Quản Lý Nạp Xu</PageHeaderTitle>
          <PageHeaderDescription>Theo dõi đơn nạp, duyệt thủ công khi đã đối soát hoặc hủy các đơn không hợp lệ.</PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <FilterBar>
        <FilterBarGroup>
          <form className="flex w-full max-w-xl items-end gap-2" onSubmit={submitSearch}>
            <div className="min-w-0 flex-1">
              <label className="mb-1.5 block text-sm font-medium" htmlFor="top-up-search">Tìm kiếm</label>
              <Input
                id="top-up-search"
                name="search"
                autoComplete="off"
                placeholder="Mã giao dịch, tài khoản hoặc email…"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
              />
            </div>
            <Button type="submit" variant="outline" disabled={loading}>
              <Search aria-hidden="true" />Tìm
            </Button>
          </form>
          <div className="w-full sm:w-48">
            <label className="mb-1.5 block text-sm font-medium" htmlFor="top-up-status">Trạng thái</label>
            <Select value={query.status} onValueChange={(value: StatusFilter) => setQuery((current) => ({ ...current, page: 1, status: value }))}>
              <SelectTrigger id="top-up-status" aria-label="Lọc theo trạng thái"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="pending">Đang chờ</SelectItem>
                <SelectItem value="success">Thành công</SelectItem>
                <SelectItem value="failed">Thất bại</SelectItem>
                <SelectItem value="cancelled">Đã hủy</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </FilterBarGroup>
        <FilterBarActions className="text-sm text-muted-foreground" aria-live="polite">
          {number.format(meta.total)} đơn nạp
        </FilterBarActions>
      </FilterBar>

      {error ? (
        <ErrorState>
          <ErrorStateTitle>Không thể tải đơn nạp</ErrorStateTitle>
          <ErrorStateDescription>{error}</ErrorStateDescription>
          <ErrorStateActions><Button type="button" variant="outline" onClick={() => setRefreshKey((value) => value + 1)}>Thử lại</Button></ErrorStateActions>
        </ErrorState>
      ) : null}

      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          {loading && orders.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground" role="status">Đang tải đơn nạp…</p>
          ) : orders.length === 0 ? (
            <EmptyState className="border-0 shadow-none">
              <EmptyStateIcon><Coins aria-hidden="true" /></EmptyStateIcon>
              <EmptyStateTitle>Chưa có đơn nạp</EmptyStateTitle>
              <EmptyStateDescription>Thay đổi bộ lọc hoặc chờ người dùng tạo yêu cầu nạp xu.</EmptyStateDescription>
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Đơn Nạp</TableHead>
                    <TableHead>Người Dùng</TableHead>
                    <TableHead className="text-right">Số Tiền</TableHead>
                    <TableHead className="text-right">Số Xu</TableHead>
                    <TableHead>Trạng Thái</TableHead>
                    <TableHead>Thời Gian</TableHead>
                    <TableHead className="text-right">Thao Tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => {
                    const status = statusPresentation[order.status];
                    return (
                      <TableRow key={order.id}>
                        <TableCell>
                          <div className="min-w-36">
                            <p className="font-semibold" translate="no">{order.code ?? `#${order.id}`}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{order.method.toUpperCase()}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="min-w-44 max-w-64">
                            <p className="truncate font-medium">{order.account.username}</p>
                            <p className="truncate text-xs text-muted-foreground" title={order.account.email}>{order.account.email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{currency.format(order.amountVnd)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{number.format(order.coins)}</TableCell>
                        <TableCell><Badge variant={status.variant}>{status.label}</Badge></TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {order.createdAt ? <time dateTime={order.createdAt}>{dateTime.format(new Date(order.createdAt))}</time> : "—"}
                        </TableCell>
                        <TableCell>
                          {order.status === "pending" ? (
                            <div className="flex justify-end gap-2">
                              <Button type="button" size="sm" onClick={() => setPendingAction({ order, action: "approve" })}>
                                <CheckCircle2 aria-hidden="true" />Duyệt
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => setPendingAction({ order, action: "cancel" })}>
                                <XCircle aria-hidden="true" />Hủy
                              </Button>
                            </div>
                          ) : <span className="block text-right text-sm text-muted-foreground">Đã xử lý</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Pagination aria-label="Phân trang đơn nạp"><PaginationContent>
        <PaginationItem><Button type="button" variant="outline" size="sm" disabled={loading || meta.page <= 1} onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}>Trước</Button></PaginationItem>
        <PaginationItem><span className="px-2 text-sm font-medium tabular-nums" aria-live="polite">Trang {meta.page} / {meta.totalPage}</span></PaginationItem>
        <PaginationItem><Button type="button" variant="outline" size="sm" disabled={loading || meta.page >= meta.totalPage} onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))}>Sau</Button></PaginationItem>
      </PaginationContent></Pagination>

      <Dialog open={pendingAction !== null} onOpenChange={(open) => { if (!open && !submitting) setPendingAction(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingAction?.action === "approve" ? "Duyệt Đơn Nạp" : "Hủy Đơn Nạp"}</DialogTitle>
            <DialogDescription>
              {pendingAction?.action === "approve"
                ? `Xác nhận đã nhận ${pendingAction ? currency.format(pendingAction.order.amountVnd) : ""}. Hệ thống sẽ cộng xu ngay và gửi thông báo thành công cho người dùng.`
                : `Hủy đơn ${pendingAction?.order.code ?? "đã chọn"}. Chỉ thực hiện khi giao dịch chưa được thanh toán hoặc không hợp lệ.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline" disabled={submitting}>Quay Lại</Button></DialogClose>
            <Button
              type="button"
              variant={pendingAction?.action === "cancel" ? "destructive" : "default"}
              disabled={submitting}
              onClick={() => void runAction()}
            >
              {submitting ? "Đang xử lý…" : pendingAction?.action === "approve" ? "Duyệt & Cộng Xu" : "Xác Nhận Hủy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
