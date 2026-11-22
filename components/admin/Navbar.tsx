"use client";
import { useEffect, useState } from "react";
import { Bell, UserCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import type { AdminNotificationResponse } from "@/lib/admin-notification-types";

const Navbar = () => {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);

  // Lắng nghe sự kiện để đồng bộ hóa số lượng thông báo chưa xem từ DB
  useEffect(() => {
    const controller = new AbortController();
    let version = 0;
    const updateUnreadCount = async () => {
      const current = ++version;
      try {
        const response = await fetch("/api/admin/notifications?limit=1", { signal: controller.signal, cache: "no-store" });
        const resData: AdminNotificationResponse = await response.json();
        if (resData.success) {
          if (!controller.signal.aborted && current === version) setUnreadCount(resData.unreadCount);
        }
      } catch (e) {
        console.error("Lỗi lấy thông báo chưa xem trên Navbar:", e);
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

  return (
    <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-end">
      {/* Search Bar */}

      {/* Right Side Actions */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button 
          onClick={() => router.push("/admin/notifications")}
          className="p-2 text-gray-500 hover:bg-gray-100 rounded-full relative cursor-pointer"
          title="Trung tâm thông báo"
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full px-1 flex items-center justify-center border border-white animate-pulse">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        <div className="h-8 w-[1px] bg-gray-200 mx-2"></div>

        {/* Admin Profile */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-gray-900">admin</p>
          </div>
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 border border-blue-200 cursor-pointer">
            <UserCircle size={24} />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
