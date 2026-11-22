import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth-session";
import { listAccountRoles } from "@/lib/server/account-roles";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;
    return NextResponse.json({ roles: await listAccountRoles() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Load account roles failed", error);
    return NextResponse.json({ message: "Không thể tải danh sách vai trò." }, { status: 500 });
  }
}
