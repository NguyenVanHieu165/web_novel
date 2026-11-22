import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { passwordVersion, verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type AuthenticatedUser = {
  idTaiKhoan: number;
  tenTaiKhoan: string;
  email: string;
  roles: string[];
};

type AuthorizationResult =
  | { authorized: true; user: AuthenticatedUser }
  | { authorized: false; response: NextResponse };

const unauthorized = (message: string, status: 401 | 403) =>
  NextResponse.json(
    {
      success: false,
      code: status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
      message,
    },
    { status },
  );

export async function requireUser(
  request: NextRequest,
): Promise<AuthorizationResult> {
  return authenticateUser(request.cookies.get("token")?.value);
}

export async function authenticateUser(token: string | undefined): Promise<AuthorizationResult> {
  if (!token) {
    return {
      authorized: false,
      response: unauthorized("Vui lòng đăng nhập để tiếp tục", 401),
    };
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return {
      authorized: false,
      response: unauthorized("Phiên đăng nhập không hợp lệ hoặc đã hết hạn", 401),
    };
  }

  const account = await prisma.taiKhoan.findFirst({
    where: {
      idTaiKhoan: payload.idTaiKhoan,
      trangThai: "active",
      OR: [{ isDeleted: false }, { isDeleted: null }],
    },
    select: {
      idTaiKhoan: true,
      tenTaiKhoan: true,
      email: true,
      matKhau: true,
      vaiTroNguoiDung: {
        select: {
          vaiTro: {
            select: { tenVaiTro: true },
          },
        },
      },
    },
  });

  if (!account || !payload.passwordVersion || payload.passwordVersion !== passwordVersion(account.matKhau)) {
    return {
      authorized: false,
      response: unauthorized("Tài khoản không còn hoạt động", 401),
    };
  }

  return {
    authorized: true,
    user: {
      idTaiKhoan: account.idTaiKhoan,
      tenTaiKhoan: account.tenTaiKhoan,
      email: account.email,
      roles: account.vaiTroNguoiDung.map(({ vaiTro }) => vaiTro.tenVaiTro),
    },
  };
}

export async function requireAdmin(
  request: NextRequest,
): Promise<AuthorizationResult> {
  const auth = await requireUser(request);
  if (!auth.authorized) return auth;

  if (!auth.user.roles.includes("admin")) {
    return {
      authorized: false,
      response: unauthorized("Bạn không có quyền quản trị", 403),
    };
  }

  return auth;
}
