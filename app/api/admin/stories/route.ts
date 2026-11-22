export const maxDuration = 60;
import { prisma } from "@/lib/prisma";
import { revalidatePublicStories } from "@/lib/server/public-cache";
import { NextResponse, NextRequest } from "next/server";
import { resSuccess, getRequestId } from "@/lib/api";
import * as z from "zod";
import { adminStoryQuerySchema } from "@/schemas/admin-story-query.schema";
import { listAdminStories } from "./story-list-query";
import { requireAdmin } from "@/lib/server/auth-session";

function serialize(data: unknown) {
    return JSON.parse(
        JSON.stringify(data, (_, value) =>
            typeof value === "bigint" ? value.toString() : value
        )
    );
}
export async function GET(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const requestId = getRequestId();
    const pathname = req.nextUrl.pathname;
    const searchParams = req.nextUrl.searchParams;
    const values = Object.fromEntries(searchParams);
    const duplicate = [...searchParams.keys()].some((key) => searchParams.getAll(key).length > 1);
    const parsed = adminStoryQuerySchema.safeParse(values);
    if (duplicate || !parsed.success) {
        return NextResponse.json({ success: false, message: "Bộ lọc không hợp lệ", errors: parsed.success ? [] : parsed.error.issues, requestId }, { status: 400 });
    }
    try {
        const result = await listAdminStories(parsed.data);
        return NextResponse.json(resSuccess({ ...result, requestId, path: pathname }));
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
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const { ImageUploadError, uploadImageToCloudinary } = await import("@/lib/cloudinary");

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
        const [anhBia, anhThumbnail] = await Promise.all([
            validateData.anhBia ? uploadImageToCloudinary(validateData.anhBia) : "",
            validateData.anhThumbnail ? uploadImageToCloudinary(validateData.anhThumbnail) : null,
        ]);
        const newStory = await prisma.truyen.create({
            data: {
                tenTruyen: validateData.tenTruyen,
                slug: validateData.slug,

                anhBia,
                anhThumbnail,

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
        revalidatePublicStories([newStory.slug], true);
        const safeData = serialize(newStory);
        return NextResponse.json(resSuccess(safeData));
    }
    catch (error) {
        if (error instanceof ImageUploadError) return NextResponse.json({ success: false, message: error.message, code: error.code }, { status: error.status });
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
