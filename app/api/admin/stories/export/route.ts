import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/server/auth-session";

export async function GET(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    try {
        const page = Math.max(Number(req.nextUrl.searchParams.get("page") || 1), 1);
        const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit") || 1000), 1), 5000);
        const stories = await prisma.truyen.findMany({
            select: {
                idTruyen: true, tenTruyen: true, soChuong: true, createdAt: true,
                truyenTheLoai: {
                select: { theLoai: { select: { tenTheLoai: true } } },
                },
            },
            orderBy: {
                idTruyen: "asc",
            },
            skip: (page - 1) * limit,
            take: limit,
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
                "X-Export-Page": String(page),
                "X-Export-Limit": String(limit),
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
