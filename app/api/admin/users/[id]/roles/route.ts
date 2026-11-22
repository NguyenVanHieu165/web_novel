import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth-session";
import { AccountRoleError, isSameOriginAccountWrite, updateAccountRoles } from "@/lib/server/account-roles";
import { accountIdParamSchema, assignRolesSchema } from "@/schemas/admin-roles.schema";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginAccountWrite(request)) {
    return NextResponse.json({ success: false, message: "Yêu cầu thay đổi vai trò không hợp lệ." }, { status: 403 });
  }
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ success: false, message: "Yêu cầu cần gửi dữ liệu JSON." }, { status: 415 });
  }

  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;
    const id = accountIdParamSchema.safeParse((await params).id);
    const body = assignRolesSchema.safeParse(await request.json().catch(() => null));
    if (!id.success || !body.success) {
      return NextResponse.json({ success: false, message: "Tài khoản hoặc danh sách vai trò không hợp lệ." }, { status: 400 });
    }

    await updateAccountRoles(auth.user.idTaiKhoan, id.data, body.data.expectedRoleIds, body.data.roleIds);
    return NextResponse.json({ success: true, message: "Đã lưu vai trò." });
  } catch (error) {
    if (error instanceof AccountRoleError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    }
    console.error("Update account roles failed", error);
    return NextResponse.json({ success: false, message: "Không thể lưu vai trò. Hãy thử lại." }, { status: 500 });
  }
}
