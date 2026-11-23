import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/auth-session";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  storySlug: z.string().trim().min(1).max(300).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.authorized) return auth.response;
    const parsed = querySchema.safeParse({
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
      storySlug: request.nextUrl.searchParams.get("storySlug") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: "Tham số lịch sử đọc không hợp lệ" }, { status: 400 });
    }
    const { page, limit, storySlug } = parsed.data;
    const where = {
      idTaiKhoan: auth.user.idTaiKhoan,
      chuong: { isDeleted: false, truyen: { isDeleted: false, ...(storySlug ? { slug: storySlug } : {}) } },
    };
    const [rows, total] = await Promise.all([
      prisma.tienDoDoc.findMany({
        where,
        orderBy: [{ ngayDocCuoi: "desc" }, { idTienDoDoc: "desc" }],
        take: limit,
        skip: (page - 1) * limit,
        select: {
          viTriDoc: true,
          phanTramDoc: true,
          ngayDocCuoi: true,
          chuong: {
            select: {
              idChuong: true,
              chuongSo: true,
              tieuDeChuong: true,
              slug: true,
              truyen: { select: { tenTruyen: true, slug: true, anhBia: true } },
            },
          },
        },
      }),
      prisma.tienDoDoc.count({ where }),
    ]);
    return NextResponse.json({
      success: true,
      data: rows.map((row) => ({
        chapterId: row.chuong.idChuong,
        chapterNumber: Number(row.chuong.chuongSo),
        chapterTitle: row.chuong.tieuDeChuong,
        chapterSlug: row.chuong.slug,
        storyTitle: row.chuong.truyen.tenTruyen,
        storySlug: row.chuong.truyen.slug,
        storyCover: row.chuong.truyen.anhBia,
        position: row.viTriDoc ?? 0,
        percent: Number(row.phanTramDoc ?? 0),
        updatedAt: row.ngayDocCuoi?.toISOString() ?? null,
      })),
      meta: { page, limit, total, totalPage: Math.max(1, Math.ceil(total / limit)) },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET READING HISTORY ERROR:", error);
    return NextResponse.json({ success: false, message: "Không thể tải lịch sử đọc" }, { status: 500 });
  }
}
