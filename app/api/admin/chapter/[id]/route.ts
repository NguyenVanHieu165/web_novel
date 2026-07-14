import { prisma } from "@/lib/prisma";
import { getRequestId, resSuccess } from "@/lib/api";
import { chapterSchema } from "@/schemas/chapter-schema";
import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";

type Params = {
  id: string;
};

type PrismaLikeError = {
  code?: string;
  message?: string;
};

function safeJson(data: unknown) {
  return JSON.parse(
    JSON.stringify(data, (_, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const getPrismaLikeError = (error: unknown): PrismaLikeError =>
  typeof error === "object" && error !== null ? error : {};

const notDeletedWhere = {
  OR: [{ isDeleted: false }, { isDeleted: null }],
};

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const requestId = getRequestId();

  try {
    const { id } = await params;
    const chapterId = Number(id);

    if (!Number.isFinite(chapterId) || chapterId <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: "ID chương không hợp lệ",
          requestId,
        },
        { status: 400 },
      );
    }

    const body = await req.json();
    const values = chapterSchema.parse(body);

    const currentChapter = await prisma.chuong.findFirst({
      where: {
        idChuong: chapterId,
        ...notDeletedWhere,
      },
      select: {
        idChuong: true,
        idTruyen: true,
      },
    });

    if (!currentChapter) {
      return NextResponse.json(
        {
          success: false,
          message: "Không tìm thấy chương",
          requestId,
        },
        { status: 404 },
      );
    }

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

    const updated = await prisma.$transaction(async (tx) => {
      const chapter = await tx.chuong.update({
        where: {
          idChuong: chapterId,
        },
        data: {
          idTruyen: values.idTruyen,
          chuongSo: values.chuongSo,
          tieuDeChuong: values.tieuDeChuong,
          slug: values.slug,
          isFree: values.isFree,
          giaXu: values.isFree ? 0 : values.giaXu,
          noiDungChuong: {
            upsert: {
              create: {
                noiDung: values.noiDung || null,
                contentType: "db",
              },
              update: {
                noiDung: values.noiDung || null,
                contentType: "db",
              },
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

      const storyIds = Array.from(
        new Set([currentChapter.idTruyen, values.idTruyen]),
      );

      await Promise.all(
        storyIds.map(async (idTruyen) => {
          const soChuong = await tx.chuong.count({
            where: {
              idTruyen,
              ...notDeletedWhere,
            },
          });

          await tx.truyen.update({
            where: {
              idTruyen,
            },
            data: {
              soChuong,
            },
          });
        }),
      );

      return chapter;
    });

    return NextResponse.json(
      resSuccess({
        message: "Cập nhật chương thành công",
        data: safeJson(updated),
        requestId,
      }),
    );
  } catch (error) {
    const prismaError = getPrismaLikeError(error);

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

    console.error("UPDATE CHAPTER ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          prismaError.code === "P2025"
            ? "Không tìm thấy chương"
            : "Không thể cập nhật chương",
        error: getErrorMessage(error),
        requestId,
      },
      { status: prismaError.code === "P2025" ? 404 : 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const requestId = getRequestId();

  try {
    const { id } = await params;
    const chapterId = Number(id);

    if (!Number.isFinite(chapterId) || chapterId <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: "ID chương không hợp lệ",
          requestId,
        },
        { status: 400 },
      );
    }

    const deleted = await prisma.$transaction(async (tx) => {
      const chapter = await tx.chuong.update({
        where: {
          idChuong: chapterId,
        },
        data: {
          isDeleted: true,
        },
        select: {
          idChuong: true,
          idTruyen: true,
          tieuDeChuong: true,
        },
      });

      const soChuong = await tx.chuong.count({
        where: {
          idTruyen: chapter.idTruyen,
          ...notDeletedWhere,
        },
      });

      await tx.truyen.update({
        where: {
          idTruyen: chapter.idTruyen,
        },
        data: {
          soChuong,
        },
      });

      return chapter;
    });

    return NextResponse.json(
      resSuccess({
        success: true,
        message: "Đã chuyển chương vào thùng rác",
        data: safeJson(deleted),
        requestId,
      }),
    );
  } catch (error) {
    const prismaError = getPrismaLikeError(error);

    console.error("DELETE CHAPTER ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          prismaError.code === "P2025"
            ? "Không tìm thấy chương"
            : "Không thể xóa chương",
        error: getErrorMessage(error),
        requestId,
      },
      { status: prismaError.code === "P2025" ? 404 : 500 },
    );
  }
}
