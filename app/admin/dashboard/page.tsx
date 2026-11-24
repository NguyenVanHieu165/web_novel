"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { BookOpen, Users, Eye, DollarSign, Loader2 } from "lucide-react";
import Chart from "@/components/admin/Chart";
import Card from "@/components/admin/card";
import { useRouter, useSearchParams } from "next/navigation";
import axiosClient from "@/lib/axios";
import {
  statisticsFilters,
  statisticsWindowQuery,
  type DashboardOverview,
} from "@/lib/admin-statistics";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card as UICard, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, EmptyStateDescription, EmptyStateIcon, EmptyStateTitle } from "@/components/shared/empty-state";
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/shared/page-header";

type RecentUser = {
  idTaiKhoan: number;
  tenTaiKhoan: string;
};

type DashboardOverviewResult =
  | { key: string; data: DashboardOverview }
  | { key: string; error: string };

function DashboardStatsCards({
  data,
  pending,
  unavailable = false,
}: {
  data?: DashboardOverview | null;
  pending: boolean;
  unavailable?: boolean;
}) {
  const placeholder = pending ? "..." : unavailable ? "—" : null;
  return (
    <div aria-busy={pending} className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      <Card
        title="Truyện mới"
        value={placeholder ?? data?.truyensTotal ?? 0}
        icon={<BookOpen size={22} className="text-blue-600" />}
        color="blue"
      />
      <Card
        title="Người dùng mới"
        value={placeholder ?? data?.useTotal ?? 0}
        icon={<Users size={22} className="text-green-600" />}
        color="green"
      />
      <Card
        title="Lượt xem truyện mới"
        value={placeholder ?? (data?.viewsTotal ?? 0).toLocaleString("vi-VN")}
        icon={<Eye size={22} className="text-purple-600" />}
        color="purple"
      />
      <Card
        title="Doanh thu"
        value={placeholder ?? `${(data?.revenueTotal ?? 0).toLocaleString("vi-VN")}đ`}
        icon={<DollarSign size={22} className="text-orange-600" />}
        color="orange"
      />
    </div>
  );
}

function DashboardStats() {
  const search = useSearchParams();
  const parsed = statisticsFilters.safeParse(Object.fromEntries(search));
  const filters = parsed.success ? parsed.data : statisticsFilters.parse({});
  const query = statisticsWindowQuery(filters);
  const [result, setResult] = useState<DashboardOverviewResult>();
  const current = result?.key === query ? result : null;

  useEffect(() => {
    const controller = new AbortController();
    axiosClient
      .get<DashboardOverview | { data: DashboardOverview }>(`/admin/dashboard/overview?${query}`, {
        signal: controller.signal,
      })
      .then((response) => {
        const payload = response.data;
        const overview = "data" in payload ? payload.data : payload;
        if (!controller.signal.aborted && overview) setResult({ key: query, data: overview });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResult({ key: query, error: "Không tải được các thẻ thống kê theo khoảng đã chọn." });
        }
      });
    return () => controller.abort();
  }, [query]);

  const data = current && "data" in current ? current.data : null;
  const error = current && "error" in current ? current.error : "";
  return (
    <div className="space-y-2">
      <DashboardStatsCards data={data} pending={!current} unavailable={Boolean(error)} />
      {error ? <p role="status" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

export default function DashboardPage() {
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const router = useRouter();

  const fetchRecentUsers = useCallback(() => {
    return axiosClient.get<{ users?: RecentUser[] }>("/admin/dashboard/recent-users").then((response) => {
      setRecentUsers(response.data.users || []);
    }).catch((err: unknown) => {
      console.error("Dashboard Fetch Error:", err);
    }).finally(() => {
      setRecentLoading(false);
    });
  }, []);

  useEffect(() => {
    void fetchRecentUsers();
  }, [fetchRecentUsers]);

  useEffect(() => {
    const handleNewFollow = () => {
      setRecentLoading(true);
      void fetchRecentUsers();
    };

    window.addEventListener("new-follow-event", handleNewFollow);

    return () => {
      window.removeEventListener("new-follow-event", handleNewFollow);
    };
  }, [fetchRecentUsers]);


  return (
    <div className="min-h-screen space-y-6 bg-background sm:space-y-8 sm:p-4">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Bảng điều khiển</PageHeaderTitle>
          <PageHeaderDescription>Chào mừng bạn trở lại hệ thống quản trị Web Novel.</PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <Suspense fallback={<DashboardStatsCards pending />}>
        <DashboardStats />
      </Suspense>

      {/* Main Content: Chart & Recent Activities */}
      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-3">
        <UICard className="min-w-0 xl:col-span-2">
          <CardHeader><CardTitle>Phân tích tăng trưởng</CardTitle></CardHeader>
          <CardContent>
          <Suspense fallback={<p role="status" className="rounded-xl border border-border p-5 text-sm text-muted-foreground">Đang tải biểu đồ…</p>}>
            <Chart />
          </Suspense>
          </CardContent>
        </UICard>

        {/* Recent Users Section */}
        <UICard className="min-h-[450px]">
          <CardHeader className="grid-cols-[1fr_auto] items-start">
            <div><CardTitle>Người dùng mới</CardTitle><CardDescription>Đăng ký gần đây</CardDescription></div>
            <Users aria-hidden="true" size={18} className="text-muted-foreground" />
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto">
            {recentLoading ? (
              <div className="flex flex-col items-center justify-center h-full space-y-2">
                <Loader2 aria-hidden="true" className="animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Đang tải…</span>
              </div>
            ) : recentUsers.length > 0 ? (
              <div className="divide-y">
                {recentUsers.map((u) => (
                  <div
                    key={u.idTaiKhoan}
                    className="flex items-center justify-between rounded-lg px-2 py-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold uppercase text-primary">
                        {u.tenTaiKhoan?.charAt(0)}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground">
                          {u.tenTaiKhoan}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ID: #{u.idTaiKhoan}
                        </span>
                      </div>
                    </div>
                    <Badge variant="secondary">Thành viên</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState className="h-full min-h-48"><EmptyStateIcon><Users /></EmptyStateIcon><EmptyStateTitle>Không có người dùng mới</EmptyStateTitle><EmptyStateDescription>Các tài khoản đăng ký gần đây sẽ xuất hiện tại đây.</EmptyStateDescription></EmptyState>
            )}
          </CardContent>

          <CardFooter><Button variant="outline" className="w-full" onClick={() => router.push("/admin/users")}>Xem tất cả</Button></CardFooter>
        </UICard>
      </div>
    </div>
  );
}
