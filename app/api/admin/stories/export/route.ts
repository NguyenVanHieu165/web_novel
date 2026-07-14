import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
export async function GET() {
    try {
        const stories = await prisma.truyen.findMany({
            include: {
                truyenTheLoai: {
                    include: {
                        theLoai: true,
                    },
                },
            },
            orderBy: {
                idTruyen: "asc",
            },
        });
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Danh sách truyện");
        worksheet.columns = [
            { header: "ID", key: "id", width: 10 },
            { header: "Tên truyện", key: "title", width: 30 },
            { header: "Số chương", key: "chapters", width: 15 },
            { header: "Tác giả", key: "author", width: 25 },
            { header: "Thể loại", key: "genres", width: 30 },
            { header: "Ngày tạo", key: "createdAt", width: 25 },
        ];
        worksheet.getRow(1).font = {
            bold: true,
        };
        stories.forEach((story) => {
            worksheet.addRow({
                id: story.idTruyen,
                title: story.tenTruyen,
                chapters: story.soChuong ?? 0,
                genres: story.truyenTheLoai.map((tl) => tl.theLoai.tenTheLoai).join(", "),
                createdAt: story.createdAt ? new Date(story.createdAt).toLocaleString("vi-VN") : "",
            });
        });
        const buffer = await workbook.xlsx.writeBuffer();
        return new NextResponse(buffer, {
            status: 200,
            headers: {
                "Content-Type":
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition":
                    'attachment; filename="danh-sach-truyen.xlsx"',
            },
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json(
            { error: "Export failed" },
            { status: 500 }
        );
    }
}