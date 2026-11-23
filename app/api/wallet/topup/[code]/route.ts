import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireUser } from "@/lib/server/auth-session";
import { topUpCodeSchema } from "@/lib/server/topup-packages";
import { findTopUpOrder } from "@/lib/server/wallet-topup";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const auth = await requireUser(request);
    if (!auth.authorized) return auth.response;

    const parsed = topUpCodeSchema.safeParse((await params).code);
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: "Mã đơn nạp không hợp lệ." }, {
        status: 400,
        headers: privateHeaders,
      });
    }

    const order = await findTopUpOrder(auth.user.idTaiKhoan, parsed.data);
    if (!order) {
      return NextResponse.json({ success: false, message: "Không tìm thấy đơn nạp." }, {
        status: 404,
        headers: privateHeaders,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        code: order.maGiaoDich,
        status: (order.trang_thai ?? "pending").toUpperCase(),
        amountVnd: Number(order.soTienVnd),
        coins: order.so_xu_nap,
        createdAt: order.createdAt?.toISOString() ?? null,
        confirmedAt: order.ngay_xac_nhan?.toISOString() ?? null,
      },
    }, { headers: privateHeaders });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "UNKNOWN";
    console.error("Top-up status lookup failed", code);
    return NextResponse.json({ success: false, message: "Không thể kiểm tra trạng thái đơn nạp." }, {
      status: 500,
      headers: privateHeaders,
    });
  }
}
