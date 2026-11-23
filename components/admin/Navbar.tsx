"use client";
import { useEffect, useState } from "react";
import { Bell, UserCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import type { AdminNotificationResponse } from "@/lib/admin-notification-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
    <header className="flex h-16 items-center justify-end border-b bg-card px-6 text-card-foreground">
      {/* Search Bar */}

      {/* Right Side Actions */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => router.push("/admin/notifications")}
          className="relative rounded-full"
          aria-label="Trung tâm thông báo"
        >
          <Bell aria-hidden="true" size={20} />
          {unreadCount > 0 && (
            <Badge variant="destructive" className="absolute -right-1 -top-1 h-4 min-w-4 border-background px-1 text-[9px]">
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>

        <div className="mx-2 h-8 w-px bg-border"></div>

        {/* Admin Profile */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold">admin</p>
          </div>
          <div className="flex size-10 items-center justify-center rounded-full border bg-primary/10 text-primary">
            <UserCircle aria-hidden="true" size={24} />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
