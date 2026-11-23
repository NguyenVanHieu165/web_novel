import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/server/auth-session";

const querySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["all", "pending", "success", "failed", "cancelled"]).default("all"),
  search: z.string().trim().max(100).default(""),
});
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  const params = request.nextUrl.searchParams;
  const query = querySchema.safeParse(Object.fromEntries(params));
  if (!query.success || [...params.keys()].some((key) => params.getAll(key).length > 1)) {
    return NextResponse.json({ success: false, message: "Bộ lọc đơn nạp không hợp lệ." }, { status: 400 });
  }

  const { page, limit, status, search } = query.data;
  const where = {
    AND: [
      ...(status === "all" ? [] : [{ trang_thai: status }]),
      ...(search
        ? [{
            OR: [
              { maGiaoDich: { contains: search } },
              { taiKhoan: { tenTaiKhoan: { contains: search } } },
              { taiKhoan: { email: { contains: search } } },
            ],
          }]
        : []),
    ],
  };

  try {
    const [orders, total] = await Promise.all([
      prisma.hoaDonNap.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { idHoaDonNap: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          idHoaDonNap: true,
          maGiaoDich: true,
          so_xu_nap: true,
          soTienVnd: true,
          trang_thai: true,
          phuongThuc: true,
          ghiChu: true,
          createdAt: true,
          ngay_xac_nhan: true,
          taiKhoan: { select: { idTaiKhoan: true, tenTaiKhoan: true, email: true } },
        },
      }),
      prisma.hoaDonNap.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: orders.map((order) => ({
        id: order.idHoaDonNap,
        code: order.maGiaoDich,
        coins: order.so_xu_nap,
        amountVnd: Number(order.soTienVnd),
        status: order.trang_thai ?? "pending",
        method: order.phuongThuc,
        note: order.ghiChu,
        createdAt: order.createdAt?.toISOString() ?? null,
        confirmedAt: order.ngay_xac_nhan?.toISOString() ?? null,
        account: {
          id: order.taiKhoan.idTaiKhoan,
          username: order.taiKhoan.tenTaiKhoan,
          email: order.taiKhoan.email,
        },
      })),
      meta: { page, limit, total, totalPage: Math.max(1, Math.ceil(total / limit)) },
    }, { headers: privateHeaders });
  } catch (error) {
    console.error("GET ADMIN TOP-UPS ERROR:", error);
    return NextResponse.json({ success: false, message: "Không thể tải danh sách nạp xu." }, { status: 500 });
  }
}
