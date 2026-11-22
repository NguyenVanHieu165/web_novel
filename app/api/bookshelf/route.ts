import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/auth-session";

const querySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.authorized) return auth.response;

    const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!query.success) {
      return NextResponse.json({ success: false, message: "Tham số tủ sách không hợp lệ" }, { status: 400 });
    }
    const { page, limit } = query.data;
    const where = {
      idTaiKhoan: auth.user.idTaiKhoan,
      truyen: { isDeleted: false },
    };
    const [follows, total] = await Promise.all([
      prisma.theoDoiTruyen.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: "desc" }, { idTheoDoiTruyen: "desc" }],
        select: {
          idTheoDoiTruyen: true,
          createdAt: true,
          truyen: {
            select: {
              idTruyen: true,
              tenTruyen: true,
              slug: true,
              anhBia: true,
              anhThumbnail: true,
              trang_thai: true,
              _count: { select: { chuong: { where: { isDeleted: false } } } },
            },
          },
        },
      }),
      prisma.theoDoiTruyen.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: follows.map((follow) => ({
        id: follow.idTheoDoiTruyen,
        followedAt: follow.createdAt?.toISOString() ?? null,
        story: {
          idTruyen: follow.truyen.idTruyen,
          tenTruyen: follow.truyen.tenTruyen,
          slug: follow.truyen.slug,
          cover: follow.truyen.anhThumbnail || follow.truyen.anhBia,
          completed: follow.truyen.trang_thai === "hoan_thanh",
          chapters: follow.truyen._count.chuong,
        },
      })),
      meta: { page, limit, total, totalPage: Math.max(Math.ceil(total / limit), 1) },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET BOOKSHELF ERROR:", error);
    return NextResponse.json({ success: false, message: "Không thể tải tủ sách. Vui lòng thử lại." }, { status: 500 });
  }
}
