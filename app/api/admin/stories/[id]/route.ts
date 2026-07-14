import { prisma } from "@/lib/prisma";

import { NextRequest, NextResponse } from "next/server";

import { resSuccess } from "@/lib/api";

import * as z from "zod";

// =======================
// SAFE JSON BIGINT
// =======================
function safeJson(data: unknown) {
    return JSON.parse(
        JSON.stringify(data, (_, value) =>
            typeof value === "bigint"
                ? value.toString()
                : value
        )
    );
}

type tParams = {
    id: string;
};

type PrismaLikeError = {
    code?: string;
    message?: string;
    meta?: unknown;
};

const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

const getPrismaLikeError = (error: unknown): PrismaLikeError =>
    typeof error === "object" && error !== null ? error : {};

// =======================
// VALIDATE SCHEMA
// =======================
const storySchema = z.object({
    tenTruyen: z.string().min(1, "Tên truyện không được để trống"),
    slug: z.string().min(1, "Slug không được để trống"),

    anhBia: z.string().optional().default(""),
    anhThumbnail: z.string().optional().nullable().default(null),

    trang_thai: z.enum([
        "dang_tien_hanh",
        "tam_dung",
        "hoan_thanh",
        "sap_ra_mat",
    ]),

    theLoaiIds: z.array(z.coerce.number()).default([]),
});
export async function GET(
    req: NextRequest,
    {
        params,
    }: {
        params: Promise<tParams>;
    },
) {
    try {
        const { id } = await params;
        const storyId = Number(id);

        if (!storyId || Number.isNaN(storyId)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "ID không hợp lệ",
                },
                {
                    status: 400,
                },
            );
        }

        const story = await prisma.truyen.findFirst({
            where: {
                idTruyen: storyId,
                isDeleted: false,
            },
            include: {
                truyenTheLoai: {
                    include: {
                        theLoai: true,
                    },
                },
                chuong: {
                    where: {
                        isDeleted: false,
                    },
                    orderBy: {
                        chuongSo: "asc",
                    },
                },
            },
        });

        if (!story) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Không tìm thấy truyện",
                },
                {
                    status: 404,
                },
            );
        }

        return NextResponse.json(resSuccess(safeJson(story)));
    } catch (error: unknown) {
        console.error("GET STORY DETAIL ERROR:", error);

        return NextResponse.json(
            {
                success: false,
                message: "Lấy chi tiết truyện thất bại",
                error: getErrorMessage(error),
            },
            {
                status: 500,
            },
        );
    }
}
// =======================
// UPDATE STORY
// =======================
export async function PUT(
    req: NextRequest,

    {
        params,
    }: {
        params: Promise<tParams>;
    }
) {
    try {
        const { id } = await params;

        const body = await req.json();

        // VALIDATE
        const validateData =
            storySchema.parse(body);
        const theLoaiIds = Array.from(
            new Set(
                validateData.theLoaiIds.filter(
                    (idTheLoai) => Number.isFinite(idTheLoai) && idTheLoai > 0
                )
            )
        );

        // CHECK EXIST
        const existStory =
            await prisma.truyen.findUnique({
                where: {
                    idTruyen: Number(id),
                },
            });

        if (!existStory) {
            return NextResponse.json(
                {
                    message:
                        "Không tìm thấy truyện",
                },
                {
                    status: 404,
                }
            );
        }

        // UPDATE
        const updated = await prisma.truyen.update({
            where: {
                idTruyen: Number(id),
            },
            data: {
                tenTruyen: validateData.tenTruyen,
                slug: validateData.slug,
                trang_thai: validateData.trang_thai,

                anhBia: validateData.anhBia ?? "",
                anhThumbnail: validateData.anhThumbnail || null,

                truyenTheLoai: {
                    deleteMany: {},
                    create: theLoaiIds.map((idTheLoai) => ({
                        idTheLoai,
                    })),
                },
            },
            include: {
                truyenTheLoai: {
                    include: {
                        theLoai: true,
                    },
                },
            },
        });

        return NextResponse.json(
            resSuccess(safeJson(updated))
        );
    } catch (error: unknown) {
        const prismaError = getPrismaLikeError(error);

        console.error(
            "UPDATE STORY ERROR:",
            error
        );
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    message: "Validation error",

                    errors: error.issues,
                },
                {
                    status: 400,
                }
            );
        }

        // UNIQUE ERROR
        if (prismaError.code === "P2002") {
            return NextResponse.json(
                {
                    message:
                        "Slug hoặc dữ liệu đã tồn tại",

                    code: prismaError.code,

                    meta: prismaError.meta,
                },
                {
                    status: 400,
                }
            );
        }

        // NOT FOUND
        if (prismaError.code === "P2025") {
            return NextResponse.json(
                {
                    message:
                        "Không tìm thấy truyện",
                },
                {
                    status: 404,
                }
            );
        }

        // SERVER ERROR
        return NextResponse.json(
            {
                message: "Update failed",

                error: getErrorMessage(error),
            },
            {
                status: 500,
            }
        );
    }
}

export async function DELETE(
    req: NextRequest,
    {
        params,
    }: {
        params: Promise<tParams>;
    }
) {
    try {
        const { id } = await params;
        const storyId = Number(id);

        if (!storyId || Number.isNaN(storyId)) {
            return NextResponse.json(
                { success: false, message: "ID không hợp lệ" },
                { status: 400 }
            );
        }

        const deletedStory = await prisma.truyen.update({
            where: {
                idTruyen: storyId,
            },
            data: {
                isDeleted: true,
            },
            select: {
                idTruyen: true,
                tenTruyen: true,
                isDeleted: true,
            },
        });

        return NextResponse.json(
            resSuccess({
                message: "Đã chuyển truyện vào trạng thái đã xoá",
                data: safeJson(deletedStory),
            })
        );
    } catch (error: unknown) {
        const prismaError = getPrismaLikeError(error);

        console.error("SOFT DELETE STORY ERROR:", error);

        if (prismaError.code === "P2025") {
            return NextResponse.json(
                {
                    success: false,
                    message: "Không tìm thấy truyện",
                },
                { status: 404 }
            );
        }

        return NextResponse.json(
            {
                success: false,
                message: "Xoá mềm truyện thất bại",
                error: getErrorMessage(error),
            },
            { status: 500 }
        );
    }
}