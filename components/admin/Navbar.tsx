"use client";
import { useEffect, useState } from "react";
import { Bell, Search, UserCircle } from "lucide-react";
import { useRouter } from "next/navigation";

const Navbar = () => {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);

  // Lắng nghe sự kiện để đồng bộ hóa số lượng thông báo chưa xem từ DB
  useEffect(() => {
    const updateUnreadCount = async () => {
      try {
        const response = await fetch("/api/admin/notifications");
        const resData = await response.json();
        if (resData.success) {
          const unread = resData.data.filter((item: any) => !item.daDoc).length;
          setUnreadCount(unread);
        }
      } catch (e) {
        console.error("Lỗi lấy thông báo chưa xem trên Navbar:", e);
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
