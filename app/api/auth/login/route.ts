import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";
import { loginSchema } from "@/schemas/auth.schema";
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";
import { setSessionCookie } from "@/lib/server/auth-cookie";

export async function POST(req: NextRequest) {
  const rate = await checkRateLimit(`login:${requestIp(req)}`, 10, 5 * 60_000);
  if (!rate.allowed) return NextResponse.json({ success: false, message: "Thử lại sau ít phút." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  try {
    const body = await req.json();

    // 1. Validate payload với Zod
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { usernameOrEmail, matKhau } = parsed.data;

    // 2. Tìm tài khoản theo username hoặc email kèm vai trò
    const user = await prisma.taiKhoan.findFirst({
      where: {
        OR: [
          { tenTaiKhoan: usernameOrEmail },
          { email: usernameOrEmail },
        ],
        isDeleted: false,
      },
      include: {
        vaiTroNguoiDung: {
          include: { vaiTro: true },
        },
      },
    });

    // Thông báo lỗi chung tránh dò quét user
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Tài khoản hoặc mật khẩu không chính xác" },
        { status: 401 }
      );
    }

    // 3. Kiểm tra trạng thái tài khoản
    if (user.trangThai === "banned" || user.trangThai === "locked") {
      return NextResponse.json(
        { success: false, message: "Tài khoản của bạn đã bị khóa" },
        { status: 403 }
      );
    }

    // 4. So khớp mật khẩu
    const isMatch = await verifyPassword(matKhau, user.matKhau);
    if (!isMatch) {
      return NextResponse.json(
        { success: false, message: "Tài khoản hoặc mật khẩu không chính xác" },
        { status: 401 }
      );
    }

    // 5. Trích xuất Roles (RBAC)
    const roles = user.vaiTroNguoiDung.map((item) => item.vaiTro.tenVaiTro);

    // 7. Cập nhật last_login ngầm
    prisma.taiKhoan.update({
      where: { idTaiKhoan: user.idTaiKhoan },
      data: { lastLogin: new Date() },
    }).catch(console.error);

    // 8. Trả về thông tin và Set HttpOnly Cookie
    const response = NextResponse.json({
      success: true,
      message: "Đăng nhập thành công",
      user: {
        idTaiKhoan: user.idTaiKhoan,
        tenTaiKhoan: user.tenTaiKhoan,
        email: user.email,
        roles,
      },
    });

    await setSessionCookie(response, { ...user, roles });

    return response;
  } catch (error) {
    console.error("Login Error:", error);
    return NextResponse.json(
      { success: false, message: "Lỗi hệ thống máy chủ" },
      { status: 500 }
    );
  }
}
