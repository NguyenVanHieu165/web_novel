import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { registerSchema } from "@/schemas/auth.schema";
import { resolveAccountRole } from "@/lib/server/account-roles";
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";

export async function POST(req: NextRequest) {
  const rate = await checkRateLimit(`register:${requestIp(req)}`, 5, 15 * 60_000);
  if (!rate.allowed) return NextResponse.json({ success: false, message: "Thử lại sau ít phút." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  try {
    const body = await req.json();

    // 1. Validate payload với Zod
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { tenTaiKhoan, email, matKhau } = parsed.data;

    // 2. Kiểm tra trùng lặp tên tài khoản hoặc email
    const existUser = await prisma.taiKhoan.findFirst({
      where: {
        OR: [
          { tenTaiKhoan: { equals: tenTaiKhoan } },
          { email: { equals: email } },
        ],
      },
      select: { idTaiKhoan: true, email: true, tenTaiKhoan: true },
    });

    if (existUser) {
      const field =
        existUser.tenTaiKhoan.toLowerCase() === tenTaiKhoan.toLowerCase()
          ? "Tên tài khoản"
          : "Email";
      return NextResponse.json(
        { success: false, message: `${field} đã được sử dụng` },
        { status: 409 }
      );
    }

    // 3. Hash mật khẩu bằng bcryptjs
    const hashedPassword = await hashPassword(matKhau);

    await prisma.$transaction(async (tx) => {
      const defaultRole = await resolveAccountRole(tx);
      const user = await tx.taiKhoan.create({
        data: {
          tenTaiKhoan,
          email,
          matKhau: hashedPassword,
          trangThai: "active",
        },
      });

      // Gán vai trò "user"
      await tx.vaiTroNguoiDung.create({
        data: {
          idTaiKhoan: user.idTaiKhoan,
          idVaiTro: defaultRole.idVaiTro,
        },
      });

      // Khởi tạo ví tiền với 0 xu
      await tx.viTien.create({
        data: {
          idTaiKhoan: user.idTaiKhoan,
          soDuXu: 0,
          tongNapXu: 0,
        },
      });
    });

    return NextResponse.json(
      { success: true, message: "Đăng ký tài khoản thành công" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Register Error:", error);
    return NextResponse.json(
      { success: false, message: "Lỗi hệ thống máy chủ" },
      { status: 500 }
    );
  }
}
