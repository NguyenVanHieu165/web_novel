import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const genres = await prisma.theLoai.findMany({
      orderBy: {
        idTheLoai: "asc",
      },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Danh sách thể loại");

    worksheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Tên thể loại", key: "name", width: 30 },
      { header: "Mô tả", key: "description", width: 45 },
      { header: "Ngày tạo", key: "createdAt", width: 25 },
    ];
    worksheet.getRow(1).font = {
      bold: true,
    };

    genres.forEach((genre) => {
      worksheet.addRow({
        id: genre.idTheLoai,
        name: genre.tenTheLoai,
        description: genre.moTa || "",
        createdAt: genre.createdAt
          ? new Date(genre.createdAt).toLocaleString("vi-VN")
          : "",
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="danh-sach-the-loai.xlsx"',
      },
    });
  } catch (error) {
    console.error("EXPORT GENRES ERROR:", error);

    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
