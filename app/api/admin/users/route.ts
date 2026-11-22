import { prisma } from "@/lib/prisma";
import { getRequestId, resSuccess } from "@/lib/api";
import { createUserSchema } from "@/schemas/user_schema";
import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { hashPassword } from "@/lib/auth";
import { requireAdmin } from "@/lib/server/auth-session";
import { AccountRoleError, isSameOriginAccountWrite, lockActiveAdministrator, resolveAccountRole } from "@/lib/server/account-roles";

const DEFAULT_PASSWORD = process.env.ADMIN_IMPORTED_USER_PASSWORD;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;

  const requestId = getRequestId();
  const searchParams = req.nextUrl.searchParams;
  const page = Math.max(Number(searchParams.get("page") || 1), 1);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 15), 1), 100);
  const search = searchParams.get("search")?.trim() || "";
  const skip = (page - 1) * limit;

  const where = {
    AND: [
      {
        OR: [{ isDeleted: false }, { isDeleted: null }],
      },
      ...(search
        ? [
            {
              OR: [
                { tenTaiKhoan: { contains: search } },
                { email: { contains: search } },
              ],
            },
          ]
        : []),
    ],
  };

  try {
    const [users, total] = await Promise.all([
      prisma.taiKhoan.findMany({
        where,
        select: {
          idTaiKhoan: true,
          tenTaiKhoan: true,
          email: true,
          vaiTroNguoiDung: {
            select: {
              vaiTro: {
                select: { tenVaiTro: true },
              },
            },
          },
          trangThai: true,
          createdAt: true,
        },
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.taiKhoan.count({ where }),
    ]);

    return NextResponse.json(
      resSuccess({
        users,
        meta: {
          page,
          limit,
          total,
          totalPage: Math.max(Math.ceil(total / limit), 1),
        },
        requestId,
        path: req.nextUrl.pathname,
      }),
    );
  } catch (error) {
    console.error("GET USERS ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Không thể tải danh sách người dùng",
        requestId,
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isSameOriginAccountWrite(req)) return NextResponse.json({ message: "Yêu cầu không hợp lệ." }, { status: 403 });
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;

  const requestId = getRequestId();

  try {
    const values = createUserSchema.parse(await req.json().catch(() => null));

    const selectedRole = values.roleId === undefined ? null : await prisma.vaiTro.findUnique({
      where: { idVaiTro: values.roleId }, select: { tenVaiTro: true },
    });
    if (values.roleId !== undefined && !selectedRole) {
      throw new AccountRoleError("Vai trò đã chọn không tồn tại.", 400);
    }
    const creatingAdmin = selectedRole?.tenVaiTro === "admin";
    if (creatingAdmin && (!values.initialPassword || values.initialPassword === DEFAULT_PASSWORD)) {
      throw new AccountRoleError("Đặt mật khẩu quản trị riêng, khác mật khẩu mặc định.", 400);
    }
    const password = creatingAdmin ? values.initialPassword : DEFAULT_PASSWORD;
    if (!password) {
      return NextResponse.json(
        { success: false, message: "ADMIN_IMPORTED_USER_PASSWORD chưa được cấu hình", requestId },
        { status: 500 },
      );
    }

    const passwordHash = await hashPassword(password);
    const created = await prisma.$transaction(async (tx) => {
      if (values.roleId !== undefined) await lockActiveAdministrator(tx, auth.user.idTaiKhoan);
      const role = await resolveAccountRole(tx, values.roleId);
      if ((role.tenVaiTro === "admin") !== creatingAdmin) {
        throw new AccountRoleError("Vai trò đã thay đổi. Hãy tải lại danh sách vai trò.", 409);
      }

      return tx.taiKhoan.create({
        data: {
          tenTaiKhoan: values.tenTaikhoan,
          email: values.email,
          trangThai: values.trangThai,
          matKhau: passwordHash,
          vaiTroNguoiDung: {
            create: { idVaiTro: role.idVaiTro },
          },
          viTien: {
            create: { soDuXu: 0, tongNapXu: 0 },
          },
        },
        select: {
          idTaiKhoan: true,
          tenTaiKhoan: true,
          email: true,
          trangThai: true,
        },
      });
    }, { isolationLevel: values.roleId === undefined ? "RepeatableRead" : "ReadCommitted" });

    return NextResponse.json(
      resSuccess({
        message: "Tạo người dùng thành công",
        user: created,
        requestId,
      }),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AccountRoleError) {
      return NextResponse.json({ success: false, message: error.message, requestId }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          message: "Validation error",
          errors: error.issues,
          requestId,
        },
        { status: 400 },
      );
    }

    console.error("CREATE USER ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Không thể tạo người dùng",
        requestId,
      },
      { status: 500 },
    );
  }
}
