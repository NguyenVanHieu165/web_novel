import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: Lấy danh sách thông báo của Admin
export async function GET() {
    try {
        const list = await prisma.thongBao.findMany({
            where: { idTaiKhoan: 4 },
            orderBy: { createdAt: "desc" },
            take: 30
        });
        return NextResponse.json({ success: true, data: list });
    } catch (error) {
        console.error("GET Notifications Error:", error);
        return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
    }
}

// PUT: Đánh dấu đã đọc thông báo (từng cái hoặc tất cả)
export async function PUT(req: Request) {
    try {
        const body = await req.json();
        const { id, isRead, all } = body;

        if (all) {
            // Đánh dấu tất cả của admin là đã đọc
            await prisma.thongBao.updateMany({
                where: { idTaiKhoan: 1 },
                data: { daDoc: true }
            });
            return NextResponse.json({ success: true, message: "Đã đánh dấu đọc tất cả" });
        }

        if (!id) {
            return NextResponse.json({ success: false, message: "Thiếu ID thông báo" }, { status: 400 });
        }

        // Đánh dấu đọc một cái cụ thể
        await prisma.thongBao.update({
            where: { idThongBao: Number(id) },
            data: { daDoc: isRead }
        });

        return NextResponse.json({ success: true, message: "Cập nhật trạng thái đọc thành công" });
    } catch (error) {
        console.error("PUT Notifications Error:", error);
        return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
    }
}

// DELETE: Xóa thông báo (từng cái hoặc tất cả)
export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");
        const all = searchParams.get("all") === "true";

        if (all) {
            // Xóa tất cả thông báo của admin
            await prisma.thongBao.deleteMany({
                where: { idTaiKhoan: 1 }
            });
            return NextResponse.json({ success: true, message: "Đã xóa toàn bộ thông báo" });
        }

        if (!id) {
            return NextResponse.json({ success: false, message: "Thiếu ID thông báo" }, { status: 400 });
        }

        // Xóa một thông báo cụ thể
        await prisma.thongBao.delete({
            where: { idThongBao: Number(id) }
        });

        return NextResponse.json({ success: true, message: "Đã xóa thông báo" });
    } catch (error) {
        console.error("DELETE Notifications Error:", error);
        return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
    }
}