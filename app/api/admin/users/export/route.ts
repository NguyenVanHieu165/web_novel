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
        const users = await prisma.taiKhoan.findMany({
            select: {
                idTaiKhoan: true, tenTaiKhoan: true, email: true, trangThai: true, createdAt: true,
                hoSoCaNhan: { select: { ho_ten: true } },
            },
            orderBy: {
                createdAt: "desc",
            },
            skip: (page - 1) * limit,
            take: limit,
        });

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Danh sách tài khoản");
        worksheet.columns = [
            { header: "ID", key: "id", width: 10 },
            { header: "Tên tài khoản", key: "username", width: 25 },
            { header: "Email", key: "email", width: 30 },
            { header: "Họ tên", key: "fullname", width: 30 },
            { header: "Trạng thái", key: "status", width: 20 },
            { header: "Ngày tạo", key: "createdAt", width: 25 },
        ];
        worksheet.getRow(1).font = {
            bold: true,
        };
        users.forEach((user) => {
            worksheet.addRow({
                id: user.idTaiKhoan,
                username: user.tenTaiKhoan,
                email: user.email,
                fullname: user.hoSoCaNhan?.ho_ten || "",
                status: user.trangThai,
                createdAt: user.createdAt
                    ? new Date(user.createdAt).toLocaleString("vi-VN")
                    : "",
            });
        });

        const buffer = await workbook.xlsx.writeBuffer();

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                "Content-Type":
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition":
                    'attachment; filename="danh-sach-tai-khoan.xlsx"',
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
