import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/auth-session";

const paramsSchema = z.object({ slug: z.string().trim().min(1).max(300) });
const ratingSchema = z.strictObject({
  stars: z.number().int().min(1).max(5),
  content: z.string().trim().max(2000).optional().default(""),
});
const privateHeaders = { "Cache-Control": "private, no-store" };
const activeRatings = { OR: [{ isDeleted: false }, { isDeleted: null }] };

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json({ success: false, message: "Truyện không hợp lệ" }, { status: 400 });
    }
    const auth = request.cookies.get("token") ? await requireUser(request) : null;
    const accountId = auth?.authorized ? auth.user.idTaiKhoan : null;
    const story = await prisma.truyen.findFirst({
      where: { slug: parsedParams.data.slug, isDeleted: false },
      select: { idTruyen: true },
    });
    if (!story) {
      return NextResponse.json({ success: false, message: "Không tìm thấy truyện" }, { status: 404 });
    }

    const [aggregate, ownRating] = await Promise.all([
      prisma.danhGiaTruyen.aggregate({
        where: { idTruyen: story.idTruyen, ...activeRatings },
        _avg: { soSao: true },
        _count: { _all: true },
      }),
      accountId === null ? null : prisma.danhGiaTruyen.findUnique({
        where: { idTaiKhoan_idTruyen: { idTaiKhoan: accountId, idTruyen: story.idTruyen } },
        select: { soSao: true, noiDung: true, isDeleted: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      average: Number((aggregate._avg.soSao ?? 0).toFixed(2)),
      total: aggregate._count._all,
      rating: ownRating && !ownRating.isDeleted
        ? { stars: ownRating.soSao, content: ownRating.noiDung ?? "" }
        : null,
    }, { headers: privateHeaders });
  } catch (error) {
    console.error("GET STORY RATING ERROR:", error);
    return NextResponse.json({ success: false, message: "Không thể tải đánh giá. Vui lòng thử lại." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const origin = request.headers.get("origin");
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin !== null && origin !== request.nextUrl.origin)
  ) {
    return NextResponse.json({ success: false, message: "Yêu cầu đánh giá không hợp lệ" }, { status: 403 });
  }

  try {
    const auth = await requireUser(request);
    if (!auth.authorized) return auth.response;
    const parsedParams = paramsSchema.safeParse(await params);
    const parsedBody = ratingSchema.safeParse(await request.json().catch(() => null));
    if (!parsedParams.success || !parsedBody.success) {
      return NextResponse.json(
        { success: false, message: "Chọn từ 1 đến 5 sao; lời đánh giá tối đa 2.000 ký tự" },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // The story lock serializes ratings so the displayed aggregate stays consistent.
      const stories = await tx.$queryRaw<Array<{ idTruyen: number }>>`
        SELECT idTRUYEN AS idTruyen FROM truyen
        WHERE slug = ${parsedParams.data.slug} AND is_deleted = 0
        FOR UPDATE
      `;
      const story = stories[0];
      if (!story) return null;
      const rating = await tx.danhGiaTruyen.upsert({
        where: { idTaiKhoan_idTruyen: { idTaiKhoan: auth.user.idTaiKhoan, idTruyen: story.idTruyen } },
        create: {
          idTaiKhoan: auth.user.idTaiKhoan,
          idTruyen: story.idTruyen,
          soSao: parsedBody.data.stars,
          noiDung: parsedBody.data.content,
          isDeleted: false,
        },
        update: { soSao: parsedBody.data.stars, noiDung: parsedBody.data.content, isDeleted: false },
        select: { soSao: true, noiDung: true },
      });
      const aggregate = await tx.danhGiaTruyen.aggregate({
        where: { idTruyen: story.idTruyen, ...activeRatings },
        _avg: { soSao: true },
        _count: { _all: true },
      });
      const average = Number((aggregate._avg.soSao ?? 0).toFixed(2));
      const total = aggregate._count._all;
      // A reader rating must not bump the story's chapter-update timestamp.
      await tx.$executeRaw`
        UPDATE truyen SET diem_danh_gia_trung_binh = ${average}, so_luot_danh_gia = ${total}
        WHERE idTRUYEN = ${story.idTruyen}
      `;
      return { average, total, rating: { stars: rating.soSao, content: rating.noiDung ?? "" } };
    });

    if (!result) {
      return NextResponse.json({ success: false, message: "Không tìm thấy truyện" }, { status: 404 });
    }
    return NextResponse.json({ success: true, ...result }, { headers: privateHeaders });
  } catch (error) {
    console.error("UPDATE STORY RATING ERROR:", error);
    return NextResponse.json({ success: false, message: "Không thể lưu đánh giá. Vui lòng thử lại." }, { status: 500 });
  }
}
