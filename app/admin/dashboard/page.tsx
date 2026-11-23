"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { BookOpen, Users, Eye, DollarSign, Loader2 } from "lucide-react";
import Chart from "@/components/admin/Chart";
import Card from "@/components/admin/card";
import { useRouter } from "next/navigation";
import axiosClient from "@/lib/axios";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card as UICard, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, EmptyStateDescription, EmptyStateIcon, EmptyStateTitle } from "@/components/shared/empty-state";
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/shared/page-header";

type DashboardOverview = {
  useTotal: number;
  truyensTotal: number;
  chuongsTotal: number;
  viewsTotal: number;
  revenueTotal: number;
};

type RecentUser = {
  idTaiKhoan: number;
  tenTaiKhoan: string;
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const router = useRouter();

  // Hàm tải dữ liệu dashboard, dùng useCallback để tránh tạo lại hàm liên tục
  const fetchAllData = useCallback(() => {
    return Promise.all([
      axiosClient.get<DashboardOverview | { data: DashboardOverview }>("/admin/dashboard/overview"),
      axiosClient.get<{ users?: RecentUser[] }>("/admin/dashboard/recent-users"),
    ]).then(([overviewRes, recentRes]) => {
      const overview = overviewRes.data;
      setData("data" in overview ? overview.data : overview);
      setRecentUsers(recentRes.data.users || []);
    }).catch((err: unknown) => {
      console.error("Dashboard Fetch Error:", err);
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  // Lần đầu tải trang
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Lắng nghe sự kiện custom từ Sidebar để tự động cập nhật thống kê khi có lượt theo dõi mới
  useEffect(() => {
    const handleNewFollow = () => {
      console.log("[DashboardPage] New follow notification event received, refreshing stats...");
      setLoading(true);
      fetchAllData();
    };

    window.addEventListener("new-follow-event", handleNewFollow);

    return () => {
      window.removeEventListener("new-follow-event", handleNewFollow);
    };
  }, [fetchAllData]);


  return (
    <div className="min-h-screen space-y-6 bg-background sm:space-y-8 sm:p-4">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Bảng điều khiển</PageHeaderTitle>
          <PageHeaderDescription>Chào mừng bạn trở lại hệ thống quản trị Web Novel.</PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card
          title="Tổng số truyện"
          value={loading ? "..." : (data?.truyensTotal ?? 0)}
          icon={<BookOpen size={22} className="text-blue-600" />}
          color="blue"
        />

        <Card
          title="Người dùng"
          value={loading ? "..." : (data?.useTotal ?? 0)}
          icon={<Users size={22} className="text-green-600" />}
          color="green"
        />

        <Card
          title="Tổng lượt xem"
          value={loading ? "..." : (data?.viewsTotal ?? 0).toLocaleString("vi-VN")}
          icon={<Eye size={22} className="text-purple-600" />}
          color="purple"
        />

        <Card
          title="Doanh thu"
          value={
            loading ? "..." : `${(data?.revenueTotal ?? 0).toLocaleString("vi-VN")}đ`
          }
          icon={<DollarSign size={22} className="text-orange-600" />}
          color="orange"
        />
      </div>

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
            {loading ? (
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
