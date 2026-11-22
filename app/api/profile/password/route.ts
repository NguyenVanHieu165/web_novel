import type { NextRequest } from "next/server";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readerMutationError, readerMutationSuccess, runReaderMutation } from "@/lib/server/reader-mutation";
import { readerPasswordSchema } from "@/schemas/reader-account.schema";

export async function PUT(request: NextRequest) {
  return runReaderMutation(request, readerPasswordSchema, async (idTaiKhoan, input) => {
    const where = { idTaiKhoan, trangThai: "active" as const, OR: [{ isDeleted: false }, { isDeleted: null }] };
    const account = await prisma.taiKhoan.findFirst({ where, select: { matKhau: true } });
    if (!account) return readerMutationError("Phiên đăng nhập không còn hợp lệ.", 401);
    if (!await verifyPassword(input.currentPassword, account.matKhau)) {
      return readerMutationError("Mật khẩu hiện tại không đúng.", 400, "currentPassword");
    }
    // For legacy bcrypt passwords, different strings can still match the old hash.
    if (await verifyPassword(input.newPassword, account.matKhau)) {
      return readerMutationError("Chọn mật khẩu khác mật khẩu hiện tại.", 400, "newPassword");
    }

    const updated = await prisma.taiKhoan.updateMany({
      where: { ...where, matKhau: account.matKhau },
      data: { matKhau: await hashPassword(input.newPassword) },
    });
    if (updated.count !== 1) {
      return readerMutationError("Mật khẩu hoặc trạng thái tài khoản đã thay đổi. Đăng nhập lại và thử lại.", 409);
    }

    return readerMutationSuccess("Đã đổi mật khẩu.");
  });
}
