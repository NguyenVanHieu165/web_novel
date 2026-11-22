import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth-session";
import { AccountRoleError, isSameOriginAccountWrite, updateAccountRolesInBulk } from "@/lib/server/account-roles";
import { bulkRolesSchema } from "@/schemas/admin-roles.schema";

export async function PUT(request: NextRequest) {
  if (!isSameOriginAccountWrite(request)) {
    return NextResponse.json({ success: false, message: "Yêu cầu thay đổi vai trò không hợp lệ." }, { status: 403 });
  }
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ success: false, message: "Yêu cầu cần gửi dữ liệu JSON." }, { status: 415 });
  }

  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;
    const body = bulkRolesSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ success: false, message: "Tài khoản, vai trò hoặc thao tác không hợp lệ." }, { status: 400 });
    }
    const count = await updateAccountRolesInBulk(auth.user.idTaiKhoan, body.data);
    const message = count
      ? `Đã cập nhật vai trò cho ${new Intl.NumberFormat("vi-VN").format(count)} tài khoản.`
      : "Các tài khoản đã có vai trò đúng như yêu cầu.";
    return NextResponse.json({ success: true, message });
  } catch (error) {
    if (error instanceof AccountRoleError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    }
    console.error("Bulk account role update failed", error);
    return NextResponse.json({ success: false, message: "Không thể lưu vai trò. Hãy thử lại." }, { status: 500 });
  }
}
