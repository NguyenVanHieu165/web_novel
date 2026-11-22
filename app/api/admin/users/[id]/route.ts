import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { resSuccess } from "@/lib/api";
import { requireAdmin } from "@/lib/server/auth-session";
import {
  AccountRoleError,
  getRoleTarget,
  isSameOriginAccountWrite,
  lockActiveAdministrator,
  protectActiveAdministrator,
  visibleAccounts,
} from "@/lib/server/account-roles";
import { accountIdParamSchema } from "@/schemas/admin-roles.schema";
import { userSchema } from "@/schemas/user_schema";

type Context = { params: Promise<{ id: string }> };

function accountError(error: unknown, operation: string) {
  if (error instanceof AccountRoleError) {
    return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  }
  console.error(operation, error);
  return NextResponse.json({ success: false, message: "Không thể lưu thay đổi tài khoản." }, { status: 500 });
}

export async function PUT(request: NextRequest, { params }: Context) {
  if (!isSameOriginAccountWrite(request)) return NextResponse.json({ message: "Yêu cầu không hợp lệ." }, { status: 403 });
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;
    const id = accountIdParamSchema.safeParse((await params).id);
    const body = userSchema.safeParse(await request.json().catch(() => null));
    if (!id.success || !body.success) {
      return NextResponse.json({ message: "Dữ liệu không hợp lệ." }, { status: 400 });
    }

    const { tenTaikhoan, email, trangThai } = body.data;
    const actorId = auth.user.idTaiKhoan;
    const user = await prisma.$transaction(async (tx) => {
      const adminRoleIds = await lockActiveAdministrator(tx, actorId);
      const target = await getRoleTarget(tx, id.data);
      if (trangThai !== "active") await protectActiveAdministrator(tx, actorId, id.data, target, adminRoleIds);
      return tx.taiKhoan.update({
        where: { ...visibleAccounts, idTaiKhoan: id.data },
        data: { tenTaiKhoan: tenTaikhoan, email, trangThai },
        select: { idTaiKhoan: true, tenTaiKhoan: true, email: true, trangThai: true, updatedAt: true },
      });
    }, { isolationLevel: "ReadCommitted" });

    return NextResponse.json(resSuccess({ user }, { message: "Cập nhật người dùng thành công" }));
  } catch (error) {
    return accountError(error, "Update account failed");
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  if (!isSameOriginAccountWrite(request)) return NextResponse.json({ message: "Yêu cầu không hợp lệ." }, { status: 403 });
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;
    const id = accountIdParamSchema.safeParse((await params).id);
    if (!id.success) return NextResponse.json({ success: false, message: "ID người dùng không hợp lệ." }, { status: 400 });

    const actorId = auth.user.idTaiKhoan;
    const data = await prisma.$transaction(async (tx) => {
      const adminRoleIds = await lockActiveAdministrator(tx, actorId);
      const target = await getRoleTarget(tx, id.data);
      await protectActiveAdministrator(tx, actorId, id.data, target, adminRoleIds);
      return tx.taiKhoan.update({
        where: { ...visibleAccounts, idTaiKhoan: id.data },
        data: { isDeleted: true },
        select: { idTaiKhoan: true, tenTaiKhoan: true, email: true, isDeleted: true },
      });
    }, { isolationLevel: "ReadCommitted" });

    return NextResponse.json(resSuccess({ message: "Xóa mềm người dùng thành công", data }));
  } catch (error) {
    return accountError(error, "Delete account failed");
  }
}
