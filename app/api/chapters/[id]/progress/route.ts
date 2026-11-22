import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { readingProgressInputSchema } from "@/lib/reading-progress";
import { requireUser, type AuthenticatedUser } from "@/lib/server/auth-session";

const paramsSchema = z.object({ id: z.coerce.number().int().positive().max(2_147_483_647) });
const progressSelect = { viTriDoc: true, phanTramDoc: true, ngayDocCuoi: true } as const;

function toProgress(row: {
  viTriDoc: number | null;
  phanTramDoc: { toString(): string } | number | null;
  ngayDocCuoi: Date | null;
} | null) {
  return {
    position: row?.viTriDoc ?? 0,
    percent: Number(row?.phanTramDoc ?? 0),
    updatedAt: row?.ngayDocCuoi?.toISOString() ?? null,
  };
}

async function checkAccess(chapterId: number, user: AuthenticatedUser) {
  const chapter = await prisma.chuong.findFirst({
    where: { idChuong: chapterId, isDeleted: false, truyen: { isDeleted: false } },
    select: { idChuong: true, isFree: true },
  });
  if (!chapter) return 404;
  if ((chapter.isFree ?? true) || user.roles.includes("admin")) return 200;

  const purchase = await prisma.chuongDaMua.findUnique({
    where: { idTaiKhoan_idChuong: { idTaiKhoan: user.idTaiKhoan, idChuong: chapterId } },
    select: { idChuong: true },
  });
  return purchase ? 200 : 403;
}

function accessError(status: number) {
  return NextResponse.json({
    success: false,
    message: status === 404 ? "Không tìm thấy chương" : "Bạn cần mở khóa chương trước khi lưu tiến độ đọc",
  }, { status });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUser(request);
    if (!auth.authorized) return auth.response;
    const expectedAccount = request.headers.get("x-reader-account");
    if (expectedAccount !== null && expectedAccount !== String(auth.user.idTaiKhoan)) {
      return NextResponse.json({ success: false, message: "Tài khoản đọc đã thay đổi. Vui lòng tải lại trang." }, { status: 409 });
    }
    const parsed = paramsSchema.safeParse(await params);
    if (!parsed.success) return NextResponse.json({ success: false, message: "ID chương không hợp lệ" }, { status: 400 });

    const chapterId = parsed.data.id;
    const status = await checkAccess(chapterId, auth.user);
    if (status !== 200) return accessError(status);
    const row = await prisma.tienDoDoc.findUnique({
      where: { idTaiKhoan_idChuong: { idTaiKhoan: auth.user.idTaiKhoan, idChuong: chapterId } },
      select: progressSelect,
    });
    return NextResponse.json({ success: true, data: toProgress(row) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET READING PROGRESS ERROR:", error);
    return NextResponse.json({ success: false, message: "Không thể tải tiến độ đọc" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin !== null && origin !== request.nextUrl.origin)) {
    return NextResponse.json({ success: false, message: "Yêu cầu không hợp lệ" }, { status: 403 });
  }

  try {
    const auth = await requireUser(request);
    if (!auth.authorized) return auth.response;
    const expectedAccount = request.headers.get("x-reader-account");
    if (expectedAccount !== null && expectedAccount !== String(auth.user.idTaiKhoan)) {
      return NextResponse.json({ success: false, message: "Tài khoản đọc đã thay đổi. Vui lòng tải lại trang." }, { status: 409 });
    }
    const parsedParams = paramsSchema.safeParse(await params);
    const parsedBody = readingProgressInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsedParams.success || !parsedBody.success) {
      return NextResponse.json({ success: false, message: "Tiến độ đọc không hợp lệ" }, { status: 400 });
    }
    const chapterId = parsedParams.data.id;
    const status = await checkAccess(chapterId, auth.user);
    if (status !== 200) return accessError(status);
    const where = { idTaiKhoan_idChuong: { idTaiKhoan: auth.user.idTaiKhoan, idChuong: chapterId } };
    const data = {
      viTriDoc: parsedBody.data.position,
      phanTramDoc: Number(parsedBody.data.percent.toFixed(2)),
      ngayDocCuoi: new Date(),
    };
    let row;
    try {
      row = await prisma.tienDoDoc.upsert({
        where,
        create: { ...data, idTaiKhoan: auth.user.idTaiKhoan, idChuong: chapterId },
        update: data,
        select: progressSelect,
      });
    } catch (error) {
      // Prisma can race on the first upsert; the composite unique key remains authoritative.
      if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2002") throw error;
      row = await prisma.tienDoDoc.update({ where, data, select: progressSelect });
    }
    return NextResponse.json({ success: true, data: toProgress(row) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("SAVE READING PROGRESS ERROR:", error);
    return NextResponse.json({ success: false, message: "Không thể lưu tiến độ đọc" }, { status: 500 });
  }
}
