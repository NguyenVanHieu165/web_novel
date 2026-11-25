import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth-session";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (!auth.authorized) {
      const response = NextResponse.json(
        { success: false, message: "Phiên đăng nhập hết hạn hoặc không hợp lệ", user: null },
        { status: 401, headers: { "Cache-Control": "private, no-store" } },
      );
      response.cookies.set("token", "", { maxAge: 0, path: "/" });
      return response;
    }

    const user = await prisma.taiKhoan.findUnique({
      where: { idTaiKhoan: auth.user.idTaiKhoan },
      select: {
        idTaiKhoan: true,
        tenTaiKhoan: true,
        email: true,
        trangThai: true,
        isDeleted: true,
        viTien: {
          select: {
            soDuXu: true,
            tongNapXu: true,
          },
        },
        hoSoCaNhan: {
          select: {
            ho_ten: true,
            anh: true,
          },
        },
      },
    });

    if (!user || user.isDeleted || user.trangThai !== "active") {
      const res = NextResponse.json(
        { success: false, message: "Tài khoản không tồn tại hoặc đã bị khóa", user: null },
        { status: 401, headers: { "Cache-Control": "private, no-store" } }
      );
      res.cookies.set("token", "", { maxAge: 0, path: "/" });
      return res;
    }

    return NextResponse.json({
      success: true,
      user: {
        idTaiKhoan: user.idTaiKhoan,
        tenTaiKhoan: user.tenTaiKhoan,
        email: user.email,
        roles: auth.user.roles,
        soDuXu: user.viTien?.soDuXu ?? 0,
        hoTen: user.hoSoCaNhan?.ho_ten ?? user.tenTaiKhoan,
        anh: user.hoSoCaNhan?.anh ?? null,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Auth Me Error:", error);
    return NextResponse.json(
      { success: false, message: "Lỗi hệ thống máy chủ", user: null },
      { status: 500, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
