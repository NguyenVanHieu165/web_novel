import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/auth-session";

const querySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});
const markReadSchema = z.union([
  z.strictObject({ id: z.number().int().positive() }),
  z.strictObject({ all: z.literal(true) }),
]);
const privateHeaders = { "Cache-Control": "private, no-store" };
const unreadWhere = { OR: [{ daDoc: false }, { daDoc: null }] };

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.authorized) return auth.response;
    const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!query.success) {
      return NextResponse.json({ success: false, message: "Tham số thông báo không hợp lệ" }, { status: 400 });
    }

    const { page, limit } = query.data;
    const where = { idTaiKhoan: auth.user.idTaiKhoan };
    const [notifications, total, unread] = await Promise.all([
      prisma.thongBao.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: "desc" }, { idThongBao: "desc" }],
        select: { idThongBao: true, tieu_de: true, noiDung: true, daDoc: true, createdAt: true },
      }),
      prisma.thongBao.count({ where }),
      prisma.thongBao.count({ where: { ...where, ...unreadWhere } }),
    ]);

    return NextResponse.json({
      success: true,
      data: notifications.map((notification) => ({
        id: notification.idThongBao,
        title: notification.tieu_de,
        content: notification.noiDung,
        read: notification.daDoc === true,
        createdAt: notification.createdAt?.toISOString() ?? null,
      })),
      meta: { page, limit, total, totalPage: Math.max(Math.ceil(total / limit), 1), unread },
    }, { headers: privateHeaders });
  } catch (error) {
    console.error("GET USER NOTIFICATIONS ERROR:", error);
    return NextResponse.json({ success: false, message: "Không thể tải thông báo. Vui lòng thử lại." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin !== null && origin !== request.nextUrl.origin)
  ) {
    return NextResponse.json({ success: false, message: "Yêu cầu thông báo không hợp lệ" }, { status: 403 });
  }

  try {
    const auth = await requireUser(request);
    if (!auth.authorized) return auth.response;
    const body = markReadSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ success: false, message: "Thông tin thông báo không hợp lệ" }, { status: 400 });
    }

    const accountWhere = { idTaiKhoan: auth.user.idTaiKhoan };
    const updated = await prisma.thongBao.updateMany({
      where: { ...accountWhere, ...("id" in body.data ? { idThongBao: body.data.id } : {}) },
      data: { daDoc: true },
    });
    if ("id" in body.data && updated.count === 0) {
      const existing = await prisma.thongBao.findFirst({
        where: { ...accountWhere, idThongBao: body.data.id },
        select: { idThongBao: true },
      });
      if (!existing) return NextResponse.json({ success: false, message: "Không tìm thấy thông báo" }, { status: 404 });
    }
    const unread = await prisma.thongBao.count({ where: { ...accountWhere, ...unreadWhere } });
    return NextResponse.json({ success: true, unread }, { headers: privateHeaders });
  } catch (error) {
    console.error("MARK USER NOTIFICATIONS READ ERROR:", error);
    return NextResponse.json({ success: false, message: "Không thể đánh dấu thông báo. Vui lòng thử lại." }, { status: 500 });
  }
}
