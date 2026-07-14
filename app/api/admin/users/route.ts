import { prisma } from "@/lib/prisma";
import { getRequestId, resSuccess } from "@/lib/api";
import { userSchema } from "@/schemas/user_schema";
import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";

const DEFAULT_PASSWORD = "123456";

export async function GET(req: NextRequest) {
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
  const requestId = getRequestId();

  try {
    const body = await req.json();
    const values = userSchema.parse(body);

    const created = await prisma.taiKhoan.create({
      data: {
        tenTaiKhoan: values.tenTaikhoan,
        email: values.email,
        trangThai: values.trangThai,
        matKhau: DEFAULT_PASSWORD,
      },
      select: {
        idTaiKhoan: true,
        tenTaiKhoan: true,
        email: true,
        trangThai: true,
      },
    });

    return NextResponse.json(
      resSuccess({
        message: "Tạo người dùng thành công",
        user: created,
        requestId,
      }),
      { status: 201 },
    );
  } catch (error) {
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
