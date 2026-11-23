import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/server/auth-session";
import { dispatchNotification } from "@/lib/server/notifications";
import { cancelAdminTopUp, confirmAdminTopUp } from "@/lib/server/wallet-topup";

const idSchema = z.coerce.number().int().positive().max(2_147_483_647);
const actionSchema = z.strictObject({ action: z.enum(["approve", "cancel"]) });
const privateHeaders = { "Cache-Control": "private, no-store" };

function isCrossOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return request.headers.get("sec-fetch-site") === "cross-site" || (origin !== null && origin !== request.nextUrl.origin);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isCrossOrigin(request)) {
    return NextResponse.json({ success: false, message: "Yêu cầu không hợp lệ." }, { status: 403 });
  }
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  const [parsedId, parsedBody] = await Promise.all([
    Promise.resolve(idSchema.safeParse((await params).id)),
    request.json().catch(() => null).then((body) => actionSchema.safeParse(body)),
  ]);
  if (!parsedId.success || !parsedBody.success) {
    return NextResponse.json({ success: false, message: "Thao tác đơn nạp không hợp lệ." }, { status: 400 });
  }

  try {
    if (parsedBody.data.action === "cancel") {
      const result = await cancelAdminTopUp(parsedId.data);
      if (result.kind === "not_found") {
        return NextResponse.json({ success: false, message: "Không tìm thấy đơn nạp." }, { status: 404 });
      }
      if (result.kind === "inactive") {
        return NextResponse.json({ success: false, message: "Chỉ có thể hủy đơn đang chờ." }, { status: 409 });
      }
      return NextResponse.json({ success: true, message: "Đã hủy đơn nạp." }, { headers: privateHeaders });
    }

    const result = await confirmAdminTopUp(parsedId.data);
    if (result.kind === "not_found") {
      return NextResponse.json({ success: false, message: "Không tìm thấy đơn nạp." }, { status: 404 });
    }
    if (result.kind === "already_processed" || result.kind === "inactive") {
      return NextResponse.json({ success: false, message: "Đơn nạp không còn ở trạng thái chờ." }, { status: 409 });
    }

    await dispatchNotification(result.notification);
    return NextResponse.json({
      success: true,
      message: "Đã duyệt đơn và cộng xu cho người dùng.",
      data: { creditedCoins: result.creditedCoins, balance: result.balance },
    }, { headers: privateHeaders });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "UNKNOWN";
    console.error("ADMIN TOP-UP ACTION ERROR:", code);
    return NextResponse.json({ success: false, message: "Không thể cập nhật đơn nạp." }, { status: 500 });
  }
}
