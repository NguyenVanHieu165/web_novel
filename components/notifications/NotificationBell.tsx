"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import Link from "next/link";
import { Bell } from "lucide-react";
import { z } from "zod";
import { useAuth } from "@/context/AuthContext";

const countSchema = z.object({ success: z.literal(true), meta: z.object({ unread: z.number().int().nonnegative() }) });

function UserNotificationBell() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let version = 0;
    const refresh = async () => {
      const current = ++version;
      try {
        const response = await fetch("/api/notifications?limit=1", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) return;
        const parsed = countSchema.safeParse(await response.json());
        if (parsed.success && !controller.signal.aborted && current === version) setCount(parsed.data.meta.unread);
      } catch (error) {
        if (!controller.signal.aborted) console.error("Không thể tải số thông báo", error);
      }
    };
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || (typeof window !== "undefined" ? window.location.origin : ""), { withCredentials: true });
    // Read the committed server count instead of incrementing optimistically:
    // reconnects and duplicate events must not inflate the badge.
    const onNotification = () => window.dispatchEvent(new Event("notifications-updated"));
    socket.on("notification", onNotification);
    socket.on("connect", onNotification);
    void refresh();
    window.addEventListener("notifications-updated", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      socket.disconnect();
      window.removeEventListener("notifications-updated", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return (
    <Link href="/thong-bao" aria-label={count ? `Thông báo, ${count} chưa đọc` : "Thông báo"}
      className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
      <Bell className="h-5 w-5" aria-hidden="true" />
      {count > 0 && <span aria-hidden="true" className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">{count > 99 ? "99+" : count}</span>}
    </Link>
  );
}

export default function NotificationBell() {
  const { user } = useAuth();
  return user ? <UserNotificationBell key={user.idTaiKhoan} /> : null;
}
