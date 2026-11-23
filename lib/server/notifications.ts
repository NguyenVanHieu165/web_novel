import "server-only";
import type { Prisma } from "@/app/generated/prisma/client";

export type NotificationDispatch = {
  type: string;
  category: "follow" | "system" | "transaction";
  title: string;
  message: string;
  userIds: number[];
  data: Record<string, unknown>;
};

const vndFormatter = new Intl.NumberFormat("vi-VN");

type TopUpNotificationOrder = {
  idHoaDonNap: number;
  idTaiKhoan: number;
  maGiaoDich: string | null;
  so_xu_nap: number;
  soTienVnd: number | { toString(): string };
};

export async function createTopUpRequestNotifications(
  tx: Prisma.TransactionClient,
  order: TopUpNotificationOrder,
  account: { tenTaiKhoan: string },
): Promise<NotificationDispatch | null> {
  const admins = await tx.taiKhoan.findMany({
    where: { trangThai: "active", OR: [{ isDeleted: false }, { isDeleted: null }], vaiTroNguoiDung: { some: { vaiTro: { tenVaiTro: "admin" } } } },
    select: { idTaiKhoan: true },
  });
  if (!admins.length) return null;

  const amount = Number(order.soTienVnd);
  const title = "💰 Yêu cầu nạp xu mới";
  const message = `Tài khoản "${account.tenTaiKhoan}" tạo yêu cầu nạp ${vndFormatter.format(amount)} đ để nhận ${vndFormatter.format(order.so_xu_nap)} xu. Mã giao dịch: ${order.maGiaoDich ?? "không có"}.`;
  const userIds = admins.map(({ idTaiKhoan }) => idTaiKhoan);
  await tx.thongBao.createMany({
    data: userIds.map((idTaiKhoan) => ({
      idTaiKhoan,
      tieu_de: title,
      noiDung: message,
      daDoc: false,
      id_doi_tuong: order.idHoaDonNap,
    })),
  });

  return {
    type: "top-up-requested",
    category: "transaction",
    title,
    message,
    userIds,
    data: { idHoaDonNap: order.idHoaDonNap, code: order.maGiaoDich, amountVnd: amount, coins: order.so_xu_nap },
  };
}

export async function createTopUpSuccessNotification(
  tx: Prisma.TransactionClient,
  order: TopUpNotificationOrder,
  balance: number,
): Promise<NotificationDispatch> {
  const title = "Nạp xu thành công";
  const message = `Đơn ${order.maGiaoDich ?? `#${order.idHoaDonNap}`} đã được xác nhận. ${vndFormatter.format(order.so_xu_nap)} xu đã được cộng vào ví. Số dư mới: ${vndFormatter.format(balance)} xu.`;
  await tx.thongBao.create({
    data: {
      idTaiKhoan: order.idTaiKhoan,
      tieu_de: title,
      noiDung: message,
      daDoc: false,
      id_doi_tuong: order.idHoaDonNap,
    },
    select: { idThongBao: true },
  });

  return {
    type: "top-up-success",
    category: "transaction",
    title,
    message,
    userIds: [order.idTaiKhoan],
    data: { idHoaDonNap: order.idHoaDonNap, code: order.maGiaoDich, coins: order.so_xu_nap, balance },
  };
}

export async function createFollowNotifications(
  tx: Prisma.TransactionClient,
  story: { idTruyen: number; tenTruyen: string },
  reader: { tenTaiKhoan: string },
): Promise<NotificationDispatch | null> {
  // The schema has no author/uploader account relation. Active admins are the
  // supported recipients; the complete admin role group is a small lookup.
  const admins = await tx.taiKhoan.findMany({
    where: { trangThai: "active", OR: [{ isDeleted: false }, { isDeleted: null }], vaiTroNguoiDung: { some: { vaiTro: { tenVaiTro: "admin" } } } },
    select: { idTaiKhoan: true },
  });
  if (!admins.length) return null;
  const title = "Lượt theo dõi mới!";
  const message = `Độc giả "${reader.tenTaiKhoan}" vừa theo dõi truyện "${story.tenTruyen}"`;
  await tx.thongBao.createMany({ data: admins.map(({ idTaiKhoan }) => ({ idTaiKhoan, tieu_de: title, noiDung: message, daDoc: false, id_doi_tuong: story.idTruyen })) });
  return { type: "new-follow", category: "follow", title, message, userIds: admins.map((admin) => admin.idTaiKhoan), data: { idTruyen: story.idTruyen } };
}

export async function createChapterNotifications(
  tx: Prisma.TransactionClient,
  story: { idTruyen: number; tenTruyen: string },
  chapter: { idChuong: number; chuongSo: { toString(): string } },
): Promise<NotificationDispatch> {
  const title = "Chương mới";
  const message = `Truyện ${story.tenTruyen} vừa ra Chương ${chapter.chuongSo.toString()}`;
  const userIds: number[] = [];
  let cursor: number | undefined;
  while (true) {
    const followers = await tx.theoDoiTruyen.findMany({
      where: { idTruyen: story.idTruyen, thong_bao_chuong_moi: true, taiKhoan: { trangThai: "active", OR: [{ isDeleted: false }, { isDeleted: null }] } },
      select: { idTheoDoiTruyen: true, idTaiKhoan: true },
      orderBy: { idTheoDoiTruyen: "asc" }, take: 500,
      ...(cursor === undefined ? {} : { cursor: { idTheoDoiTruyen: cursor }, skip: 1 }),
    });
    if (!followers.length) break;
    await tx.thongBao.createMany({ data: followers.map(({ idTaiKhoan }) => ({ idTaiKhoan, tieu_de: title, noiDung: message, daDoc: false, loai: "chuong_moi", id_doi_tuong: chapter.idChuong })) });
    userIds.push(...followers.map((follower) => follower.idTaiKhoan));
    if (followers.length < 500) break;
    cursor = followers[followers.length - 1].idTheoDoiTruyen;
  }
  return { type: "new-chapter", category: "system", title, message, userIds, data: { idTruyen: story.idTruyen, idChuong: chapter.idChuong } };
}

// Called only after commit. A socket outage must not roll back durable inboxes.
export async function dispatchNotification(notification: NotificationDispatch | null) {
  if (!notification?.userIds.length) return;
  const token = process.env.INTERNAL_SECRET_TOKEN;
  if (!token) { console.error("Notification realtime unavailable: INTERNAL_SECRET_TOKEN missing"); return; }
  const url = `${(process.env.SOCKET_SERVER_URL || "http://localhost:3001").replace(/\/+$/, "")}/api/trigger-notification`;
  for (let offset = 0; offset < notification.userIds.length; offset += 500) {
    try {
      const response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...notification, userIds: notification.userIds.slice(offset, offset + 500) }),
        signal: AbortSignal.timeout(2500),
      });
      if (!response.ok) console.error("Notification realtime delivery failed:", response.status);
    } catch { console.error("Notification realtime delivery unavailable; inbox is saved"); }
  }
}
