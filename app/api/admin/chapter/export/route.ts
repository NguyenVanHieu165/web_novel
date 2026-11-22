import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/server/auth-session";

const notDeletedWhere = {
  OR: [{ isDeleted: false }, { isDeleted: null }],
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;

  try {
    const page = Math.max(Number(req.nextUrl.searchParams.get("page") || 1), 1);
    const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit") || 1000), 1), 5000);
    const chapters = await prisma.chuong.findMany({
      where: notDeletedWhere,
      select: {
        idChuong: true,
        idTruyen: true,
        chuongSo: true,
        tieuDeChuong: true,
        slug: true,
        isFree: true,
        giaXu: true,
        createdAt: true,
        truyen: {
          select: {
            tenTruyen: true,
          },
        },
      },
      orderBy: [{ idTruyen: "asc" }, { chuongSo: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Danh sách chương");

    worksheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "ID truyện", key: "storyId", width: 12 },
      { header: "Tên truyện", key: "storyName", width: 35 },
      { header: "Số chương", key: "chapterNumber", width: 15 },
      { header: "Tiêu đề", key: "title", width: 40 },
      { header: "Slug", key: "slug", width: 35 },
      { header: "Miễn phí", key: "isFree", width: 12 },
      { header: "Giá xu", key: "price", width: 12 },
      { header: "Ngày tạo", key: "createdAt", width: 25 },
    ];
    worksheet.getRow(1).font = {
      bold: true,
    };

    chapters.forEach((chapter) => {
      worksheet.addRow({
        id: chapter.idChuong,
        storyId: chapter.idTruyen,
        storyName: chapter.truyen.tenTruyen,
        chapterNumber: Number(chapter.chuongSo),
        title: chapter.tieuDeChuong,
        slug: chapter.slug,
        isFree: chapter.isFree ? "Có" : "Không",
        price: chapter.giaXu ?? 0,
        createdAt: chapter.createdAt
          ? new Date(chapter.createdAt).toLocaleString("vi-VN")
          : "",
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="danh-sach-chuong.xlsx"',
        "X-Export-Page": String(page),
        "X-Export-Limit": String(limit),
      },
    });
  } catch (error) {
    console.error("EXPORT CHAPTERS ERROR:", error);

    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
