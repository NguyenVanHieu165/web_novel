"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { toast } from "sonner";
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
} from "lucide-react";

const Sidebar = () => {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [unreadFollows, setUnreadFollows] = useState(0);

  // 1. Đồng bộ số lượng chưa đọc từ Database khi mount và khi có cập nhật từ trang con
  useEffect(() => {
    const updateUnreadCount = async () => {
      try {
        const response = await fetch("/api/admin/notifications");
        const resData = await response.json();
        if (resData.success) {
          const unread = resData.data.filter((item: any) => !item.daDoc).length;
          setUnreadFollows(unread);
        }
      } catch (e) {
        console.error("Lỗi lấy thông báo chưa xem trên Sidebar:", e);
      }
    };

    updateUnreadCount();
    window.addEventListener("notifications-updated", updateUnreadCount);
    window.addEventListener("new-follow-event", updateUnreadCount);
    return () => {
      window.removeEventListener("notifications-updated", updateUnreadCount);
      window.removeEventListener("new-follow-event", updateUnreadCount);
    };
  }, []);

  // 2. Kết nối socket toàn cục cho admin panel
  useEffect(() => {
    const socketServerUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "http://localhost:3001";
    console.log("[Sidebar WebSocket] Connecting to:", socketServerUrl);
    
    const socket = io(socketServerUrl, {
      withCredentials: true
    });

    socket.on("connect", () => {
      console.log("[Sidebar WebSocket] Connected successfully, joining admin room...");
      socket.emit("join-admin-room");
    });

    socket.on("connect_error", (err) => {
      console.error("[Sidebar WebSocket] Connection error:", err.message);
    });

    socket.on("notification", (notification: any) => {
      console.log("[Sidebar WebSocket] Received notification:", notification);
      
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
      console.log("[Sidebar WebSocket] Disconnecting...");
      socket.disconnect();
    };
  }, []);

  // 3. Tự động đánh dấu tất cả là đã đọc trong DB khi admin truy cập vào trang thông báo
  useEffect(() => {
    if (pathname === "/admin/notifications") {
      setUnreadFollows(0);
      
      const markAllReadInDb = async () => {
        try {
          const response = await fetch("/api/admin/notifications", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ all: true })
          });
          const resData = await response.json();
          if (resData.success) {
            // Phát sự kiện cập nhật để trang notifications biết và cập nhật lại giao diện
            window.dispatchEvent(new CustomEvent("notifications-updated"));
          }
        } catch (e) {
          console.error("Lỗi cập nhật đã đọc tất cả từ Sidebar:", e);
        }
      };

      markAllReadInDb();
    }
  }, [pathname]);

  const menuItems = [
    { name: "Tổng quan", href: "/admin/dashboard", icon: LayoutDashboard },
    { name: "Quản lý truyện", href: "/admin/stories", icon: BookOpen },
    { name: "Quản lý chương", href: "/admin/chapters", icon: FileText },
    { name: "Quản lý thể loại", href: "/admin/genres", icon: Tags },
    { name: "Người dùng", href: "/admin/users", icon: Users },
    { name: "Thông báo", href: "/admin/notifications", icon: Bell },
    { name: "Cài đặt", href: "/admin/settings", icon: Settings },
  ];


  return (
    <aside
      className={`relative bg-white border-r border-gray-200 flex flex-col h-full transition-all duration-300 ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Toggle Button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 bg-white border rounded-full p-1 shadow hover:bg-gray-100"
      >
        <ChevronLeft
          size={16}
          className={`transition-transform ${collapsed ? "rotate-180" : ""}`}
        />
      </button>

      {/* Logo */}
      <div className="p-6">
        <div className="flex items-center gap-2 font-bold text-xl text-blue-600">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
            W
          </div>
          {!collapsed && <span>NovelAdmin</span>}
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 px-2 space-y-1">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link key={item.href} href={item.href}>
              <div
                className={`group relative flex items-center px-3 py-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? "bg-blue-50 text-blue-600"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {/* Icon */}
                <div
                  className={`flex items-center relative ${
                    collapsed ? "justify-center w-full" : "gap-3"
                  }`}
                >
                  <item.icon
                    size={20}
                    className={
                      isActive ? "text-blue-600" : "group-hover:text-gray-900"
                    }
                  />

                  {/* Dấu chấm đỏ khi collapsed */}
                  {collapsed && item.name === "Thông báo" && unreadFollows > 0 && (
                    <span className="absolute top-0 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  )}

                  {/* Text */}
                  {!collapsed && (
                    <span className="font-medium">{item.name}</span>
                  )}
                </div>

                {/* Số lượng thông báo chưa đọc khi mở rộng */}
                {!collapsed && item.name === "Thông báo" && unreadFollows > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">
                    {unreadFollows}
                  </span>
                )}

                {/* Active arrow */}
                {isActive && !collapsed && !(item.name === "Thông báo" && unreadFollows > 0) && (
                  <ChevronRight size={16} className="ml-auto" />
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
      <div className="p-2 border-t border-gray-100">
        <button className="group relative flex items-center px-3 py-3 w-full rounded-xl text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all">
          <div
            className={`flex items-center ${
              collapsed ? "justify-center w-full" : "gap-3"
            }`}
          >
            <LogOut size={20} />
            {!collapsed && <span className="font-medium">Đăng xuất</span>}
          </div>

          {/* Tooltip logout */}
          {collapsed && (
            <span className="absolute left-full ml-2 whitespace-nowrap bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100">
              Đăng xuất
            </span>
          )}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
