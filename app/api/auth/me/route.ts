import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, message: "Chưa đăng nhập", user: null },
        { status: 401 }
      );
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, message: "Phiên đăng nhập hết hạn hoặc không hợp lệ", user: null },
        { status: 401 }
      );
    }

    const user = await prisma.taiKhoan.findUnique({
      where: { idTaiKhoan: payload.idTaiKhoan },
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
        vaiTroNguoiDung: {
          select: {
            vaiTro: {
              select: { tenVaiTro: true },
            },
          },
        },
      },
    });

    if (!user || user.isDeleted || user.trangThai !== "active") {
      const res = NextResponse.json(
        { success: false, message: "Tài khoản không tồn tại hoặc đã bị khóa", user: null },
        { status: 401 }
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
        roles: user.vaiTroNguoiDung.map(({ vaiTro }) => vaiTro.tenVaiTro),
        soDuXu: user.viTien?.soDuXu ?? 0,
        hoTen: user.hoSoCaNhan?.ho_ten ?? user.tenTaiKhoan,
        anh: user.hoSoCaNhan?.anh ?? null,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Auth Me Error:", error);
    return NextResponse.json(
      { success: false, message: "Lỗi hệ thống máy chủ", user: null },
      { status: 500 }
    );
  }
}
