import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { resSuccess } from "@/lib/api";
import * as z from "zod";
type tParams = {
    id: string;
};
const userSchema = z.object(
    {
        tenTaikhoan: z.string().min(1, "Tên tài khoản không được để trống"),
        email: z.string().email("Email không hợp lệ"),
        trangThai: z.enum(["active", "locked", "banned"]),
    }
);
export async function PUT(req: NextRequest, { params }: { params: Promise<tParams> }) {
    try {
        const { id } = await params;
        const body = await req.json();
        const validated = userSchema.parse(body);
        const existUser =
            await prisma.taiKhoan.findUnique({
                where: {
                    idTaiKhoan: Number(id),
                },
            });

        if (!existUser) {
            return NextResponse.json(
                {
                    message:
                        "Không tìm thấy người dùng",
                },
                {
                    status: 404,
                }
            );
        }
        const updatedUser = await prisma.taiKhoan.update({
            where: {
                idTaiKhoan: Number(id),
            },
            data: {
                tenTaiKhoan: validated.tenTaikhoan,
                email: validated.email,
                trangThai: validated.trangThai,
            },
        });
        return NextResponse.json(resSuccess({ user: updatedUser }, { message: "Cập nhật người dùng thành công" }));
    }
    catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    message: "Dữ liệu không hợp lệ"
                },
                {
                    status: 400,
                }
            );
        }
        console.error("Lỗi cập nhật người dùng:", error);
        return NextResponse.json(
            {
                message: "Lỗi máy chủ",
            },
            {
                status: 500,
            }
        );
    }

}
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<tParams> }
) {
    try {
        const { id } = await params;
        const userId = Number(id);

        if (!userId || Number.isNaN(userId)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "ID người dùng không hợp lệ",
                },
                { status: 400 }
            );
        }

        const existUser = await prisma.taiKhoan.findFirst({
            where: {
                idTaiKhoan: userId,
                OR: [{ isDeleted: false }, { isDeleted: null }],
            },
        });

        if (!existUser) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Không tìm thấy người dùng hoặc người dùng đã bị xoá",
                },
                { status: 404 }
            );
        }

        const deletedUser = await prisma.taiKhoan.update({
            where: {
                idTaiKhoan: userId,
            },
            data: {
                isDeleted: true,
            },
            select: {
                idTaiKhoan: true,
                tenTaiKhoan: true,
                email: true,
                isDeleted: true,
            },
        });

        return NextResponse.json(
            resSuccess({
                message: "Xoá mềm người dùng thành công",
                data: deletedUser,
            })
        );
    } catch (error) {
        console.error("SOFT DELETE USER ERROR:", error);

        return NextResponse.json(
            {
                success: false,
                message: "Lỗi máy chủ khi xoá người dùng",
            },
            { status: 500 }
        );
    }
}