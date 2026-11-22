import type { ThongBao } from "@/app/generated/prisma/client";

type AdminNotification = Pick<ThongBao, "idThongBao" | "tieu_de" | "noiDung" | "daDoc"> & {
  createdAt: string | null;
};

export type AdminNotificationResponse =
  | { success: true; data: AdminNotification[]; unreadCount: number; meta: { page: number; limit: number; total: number; totalPage: number } }
  | { success: false };
