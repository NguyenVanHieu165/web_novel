import { prisma } from "@/lib/prisma";
import { NextResponse, NextRequest } from "next/server";
import { resSuccess, getRequestId } from "@/lib/api";
import * as z from "zod";

function serialize(data: unknown) {
    return JSON.parse(
        JSON.stringify(data, (_, value) =>
            typeof value === "bigint" ? value.toString() : value
        )
    );
}
export async function GET(req: NextRequest) {
    const requestId = getRequestId();
    const pathname = req.nextUrl.pathname;
    const searchParams = req.nextUrl.searchParams;
    const page = Number(searchParams.get("page") || 1);
    const limit = Number(searchParams.get("limit") || 15);
    const search = searchParams.get("search") || "";
    const skip = (page - 1) * limit;
    try {
        const [truyen, total] = await Promise.all([
            prisma.truyen.findMany({
                where: {
                    isDeleted: false,
                    ...(search && {
                        tenTruyen: {
                            contains: search,
                        },
                    }),
                },
                include: {
                    truyenTheLoai: {
                        include: {
                            theLoai: true,
                        },
                    },
                },
                skip,
                take: limit,
                orderBy: {
                    createdAt: "desc",
                },

            }),
            prisma.truyen.count({
                where: {
                    isDeleted: false,
                    ...(search && {
                        tenTruyen: {
                            contains: search,
                        },
                    }),
                },
            }),
        ]);
        const safeData = serialize(truyen);
        return NextResponse.json(
            resSuccess({
                data: safeData,
                meta: {
                    page,
                    limit,
                    total,
                    totalPage: Math.ceil(total / limit),
                },
                requestId,
                path: pathname,
            })
        );
    } catch (error) {
        console.error(error);

        return NextResponse.json(
            {
                message: "Server error",
                requestId,
            },
            { status: 500 }
        );
    }
}
const storySchema = z.object({
    tenTruyen: z.string().min(1, "Tên truyện không được để trống"),

    slug: z.string().min(1, "Slug không được để trống"),

    anhBia: z.string().optional().nullable().default(""),

    anhThumbnail: z.string().optional().nullable().default(null),

    trang_thai: z.enum(
        ["dang_tien_hanh", "tam_dung", "hoan_thanh", "sap_ra_mat"],
        "Trạng thái không hợp lệ",
    ),

    theLoaiIds: z.array(z.coerce.number()).default([]),
});

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        // validate input with zod
        // const { tenTruyen, slug } = storySchema.parse(body);
        const validateData = storySchema.parse(body);
        const theLoaiIds = Array.from(
            new Set(
                validateData.theLoaiIds.filter(
                    (idTheLoai) => Number.isFinite(idTheLoai) && idTheLoai > 0
                )
            )
        );
        const newStory = await prisma.truyen.create({
            data: {
                tenTruyen: validateData.tenTruyen,
                slug: validateData.slug,

                anhBia: validateData.anhBia || "",
                anhThumbnail: validateData.anhThumbnail || null,

                trang_thai: validateData.trang_thai,

                truyenTheLoai: {
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
        const safeData = serialize(newStory);
        return NextResponse.json(resSuccess(safeData));
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({
                message: "Validation error",
                errors: error.issues,
                requestId: getRequestId(),
            }, { status: 400 });
        }
        return NextResponse.json({ message: "Server error", error }, { status: 500 });
    }
}
