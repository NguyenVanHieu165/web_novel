import type { Metadata } from "next";
import NotificationList from "@/components/notifications/NotificationList";

export const metadata: Metadata = {
  title: "Thông báo của bạn | WebNovel",
  description: "Xem thông báo được gửi đến tài khoản WebNovel của bạn.",
  robots: { index: false, follow: false },
};

export default function NotificationsPage() {
  return <NotificationList />;
}
