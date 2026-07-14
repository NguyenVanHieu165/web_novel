"use client";

import { useEffect, useState, useCallback } from "react";
import { BookOpen, Users, Eye, DollarSign, Loader2 } from "lucide-react";
import Chart from "@/components/admin/Chart";
import Card from "@/components/admin/card";
import { useRouter } from "next/navigation";
import axiosClient from "@/lib/axios";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const router = useRouter();

  // Hàm tải dữ liệu dashboard, dùng useCallback để tránh tạo lại hàm liên tục
  const fetchAllData = useCallback(async () => {
    try {
      setLoading(true);
      const [overviewRes, recentRes] = await Promise.all([
        axiosClient.get("/admin/dashboard/overview"),
        axiosClient.get("/admin/dashboard/recent-users"),
      ]);

      setData(overviewRes.data.data || overviewRes.data);
      setRecentUsers(recentRes.data.users || []);
    } catch (err) {
      console.error("Dashboard Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Lần đầu tải trang
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Lắng nghe sự kiện custom từ Sidebar để tự động cập nhật thống kê khi có lượt theo dõi mới
  useEffect(() => {
    const handleNewFollow = () => {
      console.log("[DashboardPage] New follow notification event received, refreshing stats...");
      fetchAllData();
    };

    window.addEventListener("new-follow-event", handleNewFollow);

    return () => {
      window.removeEventListener("new-follow-event", handleNewFollow);
    };
  }, [fetchAllData]);


  return (
    <div className="p-6 space-y-8 bg-gray-50/50 min-h-screen">
      {/* Header Section */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Bảng điều khiển</h1>
        <p className="text-sm text-gray-500">
          Chào mừng bạn trở lại hệ thống quản trị Web Novel.
        </p>
      </div>

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
          value={loading ? "..." : (data?.viewsTotal ?? 0).toLocaleString()}
          icon={<Eye size={22} className="text-purple-600" />}
          color="purple"
        />

        <Card
          title="Doanh thu"
          value={
            loading ? "..." : `${(data?.revenueTotal ?? 0).toLocaleString()}đ`
          }
          icon={<DollarSign size={22} className="text-orange-600" />}
          color="orange"
        />
      </div>

      {/* Main Content: Chart & Recent Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart Section */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col min-h-[450px]">
          <div className="mb-4">
            <h3 className="font-bold text-gray-800">Phân tích tăng trưởng</h3>
            <p className="text-xs text-gray-400">
              Dữ liệu thống kê theo thời gian thực
            </p>
          </div>
          <div className="flex-1 w-full">
            <Chart />
          </div>
        </div>

        {/* Recent Users Section */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col min-h-[450px]">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-bold text-gray-800">Người dùng mới</h3>
              <p className="text-xs text-gray-400">Đăng ký gần đây</p>
            </div>
            <Users size={18} className="text-gray-300" />
          </div>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full space-y-2">
                <Loader2 className="animate-spin text-indigo-500" />
                <span className="text-xs text-gray-400">Đang tải...</span>
              </div>
            ) : recentUsers.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {recentUsers.map((u) => (
                  <div
                    key={u.idTaiKhoan}
                    className="flex justify-between items-center py-4 hover:bg-gray-50 px-2 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs uppercase">
                        {u.tenTaiKhoan?.charAt(0)}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-700 group-hover:text-indigo-600 transition-colors">
                          {u.tenTaiKhoan}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          ID: #{u.idTaiKhoan}
                        </span>
                      </div>
                    </div>
                    <div className="text-[10px] bg-gray-100 px-2 py-1 rounded text-gray-500">
                      Thành viên
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full">
                <p className="text-sm text-gray-400 italic">
                  Không có người dùng mới
                </p>
              </div>
            )}
          </div>

          <button
            onClick={() => router.push("/admin/users")}
            className="mt-4 w-full py-2 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors"
          >
            Xem tất cả
          </button>
        </div>
      </div>
    </div>
  );
}
