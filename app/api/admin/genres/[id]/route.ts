import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { resSuccess } from "@/lib/api";
import * as z from "zod";
type tParams = {
    id: string;
};
const genresSchema = z.object({
    tenTheLoai: z.string().min(1, "Tên thể loại không được để trống"),
    moTa: z.string().optional(),
});

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<tParams> }
) {
    try {
        const { id } = await params;
        const genreId = Number(id);

        if (!genreId || Number.isNaN(genreId)) {
            return NextResponse.json(
                { success: false, message: "ID thể loại không hợp lệ" },
                { status: 400 }
            );
        }

        const body = await req.json();
        const validateData = genresSchema.parse(body);

        const existGenre = await prisma.theLoai.findUnique({
            where: {
                idTheLoai: genreId,
            },
        });

        if (!existGenre) {
            return NextResponse.json(
                { success: false, message: "Không tìm thấy thể loại" },
                { status: 404 }
            );
        }

        const updatedGenre = await prisma.theLoai.update({
            where: {
                idTheLoai: genreId,
            },
            data: {
                tenTheLoai: validateData.tenTheLoai,
                moTa: validateData.moTa || null,
            },
        });

        return NextResponse.json(
            resSuccess({
                success: true,
                message: "Cập nhật thể loại thành công",
                data: updatedGenre,
            })
        );
    } catch (error: any) {
        console.error("UPDATE GENRE ERROR:", error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Validation error",
                    errors: error.issues,
                },
                { status: 400 }
            );
        }
        if (error.code === "P2025") {
            return NextResponse.json(
                { success: false, message: "Không tìm thấy thể loại" },
                { status: 404 }
            );
        }
        return NextResponse.json(
            {
                success: false,
                message: "Cập nhật thể loại thất bại",
                error: error?.message || error,
            },
            { status: 500 }
        );
    }
}

export async function DELETE(req: NextRequest,
    {
        params,
    }: {
        params: Promise<tParams>;
    }) {
    try {
        const { id } = await params;
        const genreId = Number(id);

        const deletedGenre = await prisma.theLoai.delete({
            where: {
                idTheLoai: genreId,
            },
        });

        return NextResponse.json(
            resSuccess({
                success: true,
                message: "Xoá thể loại thành công",
                data: {
                    idTheLoai: deletedGenre.idTheLoai,
                    tenTheLoai: deletedGenre.tenTheLoai,
                },
            })
        );
    }
    catch (error: any) {
        console.error("DELETE STORY ERROR:", error);

        // Trường hợp Prisma không tìm thấy bản ghi để xoá
        if (error.code === "P2025") {
            return NextResponse.json(
                {
                    success: false,
                    message: "Không thể xoá vì không tìm thấy truyện trong hệ thống",
                },
                { status: 404 }
            );
        }

        // Các lỗi server khác (ví dụ: đang có khoá ngoại liên kết không cho xoá)
        return NextResponse.json(
            {
                success: false,
                message: "Xoá truyện thất bại (có thể do ràng buộc dữ liệu)",
                error: error?.message || error,
            },
            { status: 500 }
        );
    }
}