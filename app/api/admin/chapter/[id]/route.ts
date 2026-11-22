import { prisma } from "@/lib/prisma";
import { getRequestId, resSuccess } from "@/lib/api";
import { writingChapterSchema } from "@/schemas/chapter-writing.schema";
import { ensureWritingDatabase, saveWritingChapter } from "@/lib/server/chapter-writing";
import { readWritingJson, writingOriginError, writingErrorResponse } from "@/lib/server/chapter-document-http";
import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { requireAdmin } from "@/lib/server/auth-session";

type Params = {
  id: string;
};

function safeJson(data: unknown) {
  return JSON.parse(
    JSON.stringify(data, (_, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );
}

const notDeletedWhere = {
  OR: [{ isDeleted: false }, { isDeleted: null }],
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;

  const requestId = getRequestId();
  const { id } = await params;
  const chapterId = Number(id);
  if (!Number.isSafeInteger(chapterId) || chapterId <= 0) {
    return NextResponse.json({ success: false, message: "ID chương không hợp lệ", requestId }, { status: 400 });
  }

  try {
    const chapter = await prisma.chuong.findFirst({
      where: { idChuong: chapterId },
      select: {
        idChuong: true,
        idTruyen: true,
        chuongSo: true,
        tieuDeChuong: true,
        slug: true,
        isFree: true,
        giaXu: true,
        isDeleted: true,
        truyen: { select: { idTruyen: true, tenTruyen: true } },
        noiDungChuong: { select: { noiDung: true } },
      },
    });
    if (!chapter) return NextResponse.json({ success: false, message: "Không tìm thấy chương", requestId }, { status: 404 });
    return NextResponse.json({ success: true, data: safeJson(chapter), requestId });
  } catch (error) {
    console.error("GET CHAPTER ERROR:", error);
    return NextResponse.json({ success: false, message: "Không thể tải chương", requestId }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<Params> }) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;
  const originError = writingOriginError(req);
  if (originError) return originError;
  try {
    const chapterId = z.coerce.number().int().positive().parse((await params).id);
    const body = await readWritingJson(req);
    const values = writingChapterSchema.parse({ ...(typeof body === "object" && body !== null ? body : {}), idChuong: chapterId });
    const chapter = await saveWritingChapter(prisma, auth.user, values, "admin");
    return NextResponse.json(resSuccess({ message: "Cập nhật chương thành công", data: chapter, requestId: getRequestId() }));
  } catch (error) { return writingErrorResponse(error); }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;

  const originError = writingOriginError(req);
  if (originError) return originError;

  const requestId = getRequestId();

  try {
    const { id } = await params;
    const chapterId = Number(id);

    if (!Number.isSafeInteger(chapterId) || chapterId <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: "ID chương không hợp lệ",
          requestId,
        },
        { status: 400 },
      );
    }

    await ensureWritingDatabase(prisma);
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

      const key = `studio.chapter.${chapterId}`;
      const marker = await tx.caiDatHeThong.findUnique({ where: { khoa: key }, select: { giaTri: true } });
      let notified = true;
      if (marker) {
        const value: unknown = JSON.parse(marker.giaTri);
        if (typeof value === "object" && value !== null && "notified" in value && typeof value.notified === "boolean") notified = value.notified;
      }
      const publication = JSON.stringify({ version: 1, publication: "trashed", notified });
      await tx.caiDatHeThong.upsert({ where: { khoa: key }, create: { khoa: key, giaTri: publication, moTa: "Trạng thái chương sáng tác" }, update: { giaTri: publication } });

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
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025")
      return NextResponse.json({ success: false, message: "Không tìm thấy chương", requestId }, { status: 404 });
    return writingErrorResponse(error);
  }
}
