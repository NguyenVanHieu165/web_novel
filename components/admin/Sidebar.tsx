"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { toast } from "sonner";
import type { AdminNotificationResponse } from "@/lib/admin-notification-types";
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  Users,
  Settings,
  LogOut,
  ChevronRight,
  Tags,
  ChevronLeft,
  Bell,
  Loader2,
  ShieldCheck,
  ScrollText,
} from "lucide-react";

const Sidebar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [unreadFollows, setUnreadFollows] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);

  // Xử lý đăng xuất
  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        toast.success("Đăng xuất thành công");
        router.push("/dang-nhap");
        router.refresh();
      } else {
        toast.error("Đăng xuất thất bại");
      }
    } catch (e) {
      console.error("Lỗi đăng xuất:", e);
      toast.error("Có lỗi xảy ra khi đăng xuất");
    } finally {
      setLoggingOut(false);
    }
  };

  // 1. Đồng bộ số lượng chưa đọc từ Database khi mount và khi có cập nhật từ trang con
  useEffect(() => {
    const controller = new AbortController();
    let version = 0;
    const updateUnreadCount = async () => {
      const current = ++version;
      try {
        const response = await fetch("/api/admin/notifications?limit=1", { signal: controller.signal, cache: "no-store" });
        const resData: AdminNotificationResponse = await response.json();
        if (resData.success) {
          if (!controller.signal.aborted && current === version) setUnreadFollows(resData.unreadCount);
        }
      } catch (e) {
        console.error("Lỗi lấy thông báo chưa xem trên Sidebar:", e);
      }
    };

    updateUnreadCount();
    window.addEventListener("notifications-updated", updateUnreadCount);
    window.addEventListener("new-follow-event", updateUnreadCount);
    window.addEventListener("focus", updateUnreadCount);
    return () => {
      controller.abort();
      window.removeEventListener("focus", updateUnreadCount);
      window.removeEventListener("notifications-updated", updateUnreadCount);
      window.removeEventListener("new-follow-event", updateUnreadCount);
    };
  }, []);

  // 2. Kết nối socket toàn cục cho admin panel
  useEffect(() => {
    const socketServerUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || (typeof window !== "undefined" ? window.location.origin : "");
    
    const socket = io(socketServerUrl, {
      withCredentials: true
    });

    socket.on("connect", () => {
      socket.emit("join-admin-room");
      window.dispatchEvent(new Event("notifications-updated"));
    });

    socket.on("connect_error", () => undefined);

    socket.on("notification", (notification: { title?: string; message?: string; category?: string }) => {
      
      const title = notification.title || "Thông báo mới";
      const desc = notification.message;
      const category = notification.category || "follow";

      // Hiển thị Toast đẹp mắt dựa trên phân loại (Category)
      if (category === "report") {
        toast.error(title, {
          description: desc,
          icon: "⚠️",
          duration: 8000,
        });
      } else if (category === "transaction") {
        toast.success(title, {
          description: desc,
          icon: "💰",
          duration: 7000,
        });
      } else if (category === "system") {
        toast.info(title, {
          description: desc,
          icon: "⚙️",
          duration: 7000,
        });
      } else {
        toast.success(title, {
          description: desc,
          icon: "❤️",
          duration: 6000,
        });
      }

      // Phát sự kiện DOM kèm theo tin nhắn đầy đủ để các trang con cập nhật tự động từ Database
      window.dispatchEvent(new CustomEvent("new-follow-event", { detail: notification }));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const menuItems = [
    { name: "Tổng quan", href: "/admin/dashboard", icon: LayoutDashboard },
    { name: "Quản lý truyện", href: "/admin/stories", icon: BookOpen },
    { name: "Quản lý chương", href: "/admin/chapters", icon: FileText },
    { name: "Quản lý thể loại", href: "/admin/genres", icon: Tags },
    { name: "Người dùng", href: "/admin/users", icon: Users },
    { name: "Phân quyền", href: "/admin/permissions", icon: ShieldCheck },
    { name: "Thông báo", href: "/admin/notifications", icon: Bell },
    { name: "Nhật ký hệ thống", href: "/admin/system-logs", icon: ScrollText },
    { name: "Cài đặt", href: "/admin/settings", icon: Settings },
  ];


  return (
    <aside
      className={`relative flex h-full w-14 shrink-0 flex-col border-r border-border bg-card transition-[width] duration-300 ${
        collapsed ? "md:w-20" : "md:w-64"
      }`}
   >
      {/* Toggle Button */}
      <button
        type="button"
        aria-label={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 z-10 hidden rounded-full border border-border bg-card p-1 text-foreground shadow hover:bg-muted focus-visible:outline-2 focus-visible:outline-indigo-500 md:block"
      >
        <ChevronLeft

          size={16}
          className={`transition-transform ${collapsed ? "rotate-180" : ""}`}
        />
      </button>

      {/* Logo */}
      <div className="px-3 py-5 md:px-6 md:py-6">
        <div className="flex items-center gap-2 text-xl font-bold text-blue-600 dark:text-blue-400">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
            W
          </div>
          {!collapsed && <span className="hidden md:inline">NovelAdmin</span>}
        </div>
      </div>

      {/* Menu */}
      <nav aria-label="Điều hướng quản trị" className="flex-1 space-y-1 px-1 md:px-2">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link key={item.href} href={item.href} aria-label={item.name} aria-current={isActive ? "page" : undefined}
              className="block rounded-xl focus-visible:outline-2 focus-visible:outline-indigo-500">
              <div
                className={`group relative flex items-center rounded-xl px-2 py-3 transition-colors md:px-3 ${
                  isActive
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {/* Icon */}
                <div
                  className={`relative flex w-full items-center justify-center ${
                    collapsed ? "" : "md:w-auto md:justify-start md:gap-3"
                  }`}
                >
                  <item.icon
                    size={20}
                    aria-hidden="true"
                  />

                  {/* Dấu chấm đỏ khi collapsed */}
                  {item.name === "Thông báo" && unreadFollows > 0 && (
                    <span aria-hidden="true" className={`absolute right-1 top-0 size-2 rounded-full bg-red-500 ${collapsed ? "" : "md:hidden"}`} />
                  )}

                  {/* Text */}
                  {!collapsed && (
                    <span className="hidden font-medium md:inline">{item.name}</span>
                  )}
                </div>

                {/* Số lượng thông báo chưa đọc khi mở rộng */}
                {!collapsed && item.name === "Thông báo" && unreadFollows > 0 && (
                  <span className="ml-auto hidden rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white md:inline">
                    {unreadFollows}
                  </span>
                )}

                {/* Active arrow */}
                {isActive && !collapsed && !(item.name === "Thông báo" && unreadFollows > 0) && (
                  <ChevronRight aria-hidden="true" size={16} className="ml-auto hidden md:block" />
                )}

                {/* Tooltip khi collapsed */}
                {collapsed && (
                  <span className="absolute left-full ml-2 whitespace-nowrap bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100">
                    {item.name}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className={`border-t border-border p-1 md:p-2 ${process.env.NODE_ENV === "development" ? "pb-14 md:pb-14" : ""}`}>
        <button
          type="button"
          aria-label="Đăng xuất"
          onClick={handleLogout}
          disabled={loggingOut}
          className="group relative flex items-center px-3 py-3 w-full rounded-xl text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <div
            className={`flex items-center ${
              collapsed ? "w-full justify-center" : "w-full justify-center md:justify-start md:gap-3"
            }`}
          >
            {loggingOut ? (
              <Loader2 size={20} className="animate-spin text-red-500" />
            ) : (
              <LogOut size={20} />
            )}
            {!collapsed && (
              <span className="hidden font-medium md:inline">
                {loggingOut ? "Đang thoát..." : "Đăng xuất"}
              </span>
            )}
          </div>

          {/* Tooltip logout */}
          {collapsed && (
            <span className="absolute left-full ml-2 whitespace-nowrap bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 z-50">
              Đăng xuất
            </span>
          )}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
