import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { chapterListQuerySchema, getChapterNumberSearch } from "@/lib/chapter-list";
import { requireUser } from "@/lib/server/auth-session";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const parsedQuery = chapterListQuerySchema.safeParse({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    search: request.nextUrl.searchParams.get("search") ?? undefined,
    order: request.nextUrl.searchParams.get("order") ?? undefined,
    chapterId: request.nextUrl.searchParams.get("chapterId") ?? undefined,
    includeAccess: request.nextUrl.searchParams.get("includeAccess") ?? undefined,
  });
  if (!parsedQuery.success) {
    return NextResponse.json({ success: false, message: "Tham số danh sách chương không hợp lệ" }, { status: 400 });
  }

  const { page: requestedPage, limit, search, order, chapterId, includeAccess } = parsedQuery.data;

  try {
  const story = await prisma.truyen.findFirst({
    where: { slug, isDeleted: false },
    select: { idTruyen: true },
  });
  if (!story) return NextResponse.json({ success: false, message: "Không tìm thấy truyện" }, { status: 404 });

  const chapterNumber = getChapterNumberSearch(search);
  const where: Prisma.ChuongWhereInput = {
    idTruyen: story.idTruyen,
    isDeleted: false,
    ...(search
      ? chapterNumber !== null ? { chuongSo: { equals: chapterNumber } } : {
          OR: [
            { tieuDeChuong: { contains: search } },
            { slug: { contains: search } },
          ],
        }
      : {}),
  };
  const [total, currentChapter] = await Promise.all([
    prisma.chuong.count({ where }),
    chapterId && !search && requestedPage === undefined
      ? prisma.chuong.findFirst({
          where: { ...where, idChuong: chapterId },
          select: { idChuong: true, chuongSo: true },
        })
      : null,
  ]);
  let page = requestedPage ?? 1;
  if (currentChapter) {
    const comparison = order === "asc" ? "lt" : "gt";
    const preceding = await prisma.chuong.count({
      where: {
        AND: [where, { OR: [
          { chuongSo: { [comparison]: currentChapter.chuongSo } },
          { chuongSo: currentChapter.chuongSo, idChuong: { [comparison]: currentChapter.idChuong } },
        ] }],
      },
    });
    page = Math.floor(preceding / limit) + 1;
  }
  const totalPage = Math.max(Math.ceil(total / limit), 1);
  page = Math.min(page, totalPage);
  const chapters = total > 0 ? await prisma.chuong.findMany({
      where,
      orderBy: [{ chuongSo: order }, { idChuong: order }],
      skip: (page - 1) * limit,
      take: limit,
      select: { idChuong: true, chuongSo: true, tieuDeChuong: true, slug: true, isFree: true, giaXu: true, updatedAt: true },
    }) : [];
  if (!includeAccess) {
    return NextResponse.json({ data: chapters, meta: { page, limit, total, totalPage } }, { headers: { "Cache-Control": "no-store" } });
  }

  const paidIds = chapters.filter((chapter) => chapter.isFree === false).map((chapter) => chapter.idChuong);
  const auth = paidIds.length && request.cookies.has("token") ? await requireUser(request) : null;
  const user = auth?.authorized ? auth.user : null;
  const isAdmin = user?.roles.includes("admin") ?? false;
  const purchases = user && !isAdmin ? await prisma.chuongDaMua.findMany({
    where: { idTaiKhoan: user.idTaiKhoan, idChuong: { in: paidIds } },
    select: { idChuong: true },
  }) : [];
  const purchasedIds = new Set(purchases.map(({ idChuong }) => idChuong));
  const data = chapters.map((chapter) => ({
    ...chapter,
    canRead: chapter.isFree !== false || isAdmin || purchasedIds.has(chapter.idChuong),
  }));
  return NextResponse.json({ data, meta: { page, limit, total, totalPage } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Không thể tải danh sách chương", error);
    return NextResponse.json({ success: false, message: "Không thể tải mục lục. Vui lòng thử lại." }, { status: 500 });
  }
}
