import { prisma } from "@/lib/prisma";
import { getRequestId, resSuccess } from "@/lib/api";
import { chapterSchema } from "@/schemas/chapter-schema";
import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";



const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const notDeletedWhere = {
  OR: [{ isDeleted: false }, { isDeleted: null }],
};

export async function GET(req: NextRequest) {
  const requestId = getRequestId();
  const searchParams = req.nextUrl.searchParams;
  const page = Math.max(Number(searchParams.get("page") || 1), 1);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 2), 1), 100);
  const search = searchParams.get("search")?.trim() || "";
  const idTruyen = Number(searchParams.get("idTruyen") || 0);
  const skip = (page - 1) * limit;

  try {
    const where = {
      AND: [
        notDeletedWhere,
        ...(idTruyen > 0 ? [{ idTruyen }] : []),
        ...(search
          ? [
            {
              OR: [
                { tieuDeChuong: { contains: search } },
                { slug: { contains: search } },
                { truyen: { tenTruyen: { contains: search } } },
              ],
            },
          ]
          : []),
      ],
    };

    const [chapters, total] = await Promise.all([
      prisma.chuong.findMany({
        where,
        include: {
          truyen: {
            select: {
              idTruyen: true,
              tenTruyen: true,
            },
          },
          noiDungChuong: true,
        },
        skip,
        take: limit,
        orderBy: [{ idTruyen: "asc" }, { chuongSo: "asc" }],
      }),
      prisma.chuong.count({ where }),
    ]);

    return NextResponse.json(
      resSuccess({
        data: (chapters),
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
    console.error("GET CHAPTERS ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Không thể tải danh sách chương",
        error: getErrorMessage(error),
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
    const values = chapterSchema.parse(body);

    const story = await prisma.truyen.findFirst({
      where: {
        idTruyen: values.idTruyen,
        ...notDeletedWhere,
      },
      select: {
        idTruyen: true,
      },
    });

    if (!story) {
      return NextResponse.json(
        {
          success: false,
          message: "Không tìm thấy truyện",
          requestId,
        },
        { status: 404 },
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const chapter = await tx.chuong.create({
        data: {
          idTruyen: values.idTruyen,
          chuongSo: values.chuongSo,
          tieuDeChuong: values.tieuDeChuong,
          slug: values.slug,
          isFree: values.isFree,
          giaXu: values.isFree ? 0 : values.giaXu,
          noiDungChuong: {
            create: {
              noiDung: values.noiDung || null,
              contentType: "db",
            },
          },
        },
        include: {
          truyen: {
            select: {
              idTruyen: true,
              tenTruyen: true,
            },
          },
          noiDungChuong: true,
        },
      });

      const soChuong = await tx.chuong.count({
        where: {
          idTruyen: values.idTruyen,
          ...notDeletedWhere,
        },
      });

      await tx.truyen.update({
        where: {
          idTruyen: values.idTruyen,
        },
        data: {
          soChuong,
        },
      });

      return chapter;
    });

    return NextResponse.json(
      resSuccess({
        message: "Thêm chương thành công",
        data: (created),
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

    console.error("CREATE CHAPTER ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Không thể thêm chương",
        error: getErrorMessage(error),
        requestId,
      },
      { status: 500 },
    );
  }
}
