import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { resSuccess, getRequestId } from "@/lib/api";
import { genres_schema } from "@/schemas/genres_schema";
import * as z from "zod";

export async function GET(req: NextRequest) {
    const requestId = getRequestId();
    const pathname = req.nextUrl.pathname;
    const searchParams = req.nextUrl.searchParams;

    const page = Number(searchParams.get("page") || 1);
    const limit = Number(searchParams.get("limit") || 15);
    const search = searchParams.get("search") || "";
    const skip = (page - 1) * limit;

    try {
        const where = {
            ...(search && {
                tenTheLoai: {
                    contains: search,
                },
            }),
        };

        const [genres, total] = await Promise.all([
            prisma.theLoai.findMany({
                where,
                skip,
                take: limit,
                orderBy: {
                    createdAt: "desc",
                },
            }),

            prisma.theLoai.count({
                where,
            }),
        ]);

        return NextResponse.json(
            resSuccess({
                data: (genres),
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
                success: false,
                message: "Server error",
                requestId,
            },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    const requestId = getRequestId();
    const pathname = req.nextUrl.pathname;

    try {
        const body = await req.json();
        const validateData = genres_schema.parse(body);

        const newGenre = await prisma.theLoai.create({
            data: {
                tenTheLoai: validateData.tenTheLoai,
                moTa: validateData.moTa || null,
            },
        });

        return NextResponse.json(
            resSuccess({
                message: "Thêm thể loại thành công",
                data: (newGenre),
                requestId,
                path: pathname,
            })
        );
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Validation error",
                    errors: error.issues,
                    requestId,
                },
                { status: 400 }
            );
        }

        console.error(error);

        return NextResponse.json(
            {
                success: false,
                message: "Server error",
                requestId,
            },
            { status: 500 }
        );
    }
}
