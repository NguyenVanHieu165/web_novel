import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import * as z from "zod";

import { prisma } from "@/lib/prisma";
import { getRequestId, resSuccess } from "@/lib/api";
function chunkArray<T>(array: T[], size: number) {
    const result: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}
const storyImportSchema = z.object({
    tenTruyen: z.string().trim().min(1, "Tên truyện không được để trống"),
    slug: z.string().trim().min(1, "Slug không được để trống"),
    trang_thai: z
        .enum(["dang_tien_hanh", "tam_dung", "hoan_thanh", "sap_ra_mat"])
        .default("dang_tien_hanh"),

    moTa: z.string().trim().optional().or(z.literal("")),
});
export async function POST(req: NextRequest) {
    const requestId = getRequestId();
    try {
        const formData = await req.formData();

        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Chưa chọn file Excel",
                    requestId,
                },
                { status: 400 }
            );
        }
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const workbook = XLSX.read(buffer, {
            type: "buffer",
        });

        const sheetName = workbook.SheetNames[0];

        const sheet = workbook.Sheets[sheetName];

        const rows: any[] = XLSX.utils.sheet_to_json(sheet);

        if (!rows.length) {
            return NextResponse.json(
                {
                    success: false,
                    message: "File Excel rỗng",
                    requestId,
                },
                { status: 400 }
            );
        }

        const validData: {
            excelRow: number;
            tenTruyen: string;
            slug: string;
            moTa: string | null;
            trang_thai:
            | "dang_tien_hanh"
            | "tam_dung"
            | "hoan_thanh"
            | "sap_ra_mat";
        }[] = [];

        const errors: {
            row: number;
            field?: string;
            message: string;
            data?: any;
        }[] = [];

        const seenSlugs = new Set<string>();

        for (let index = 0; index < rows.length; index++) {
            const row = rows[index];

            const excelRow = index + 2;

            const rawData = {
                tenTruyen: row.tenTruyen ?? row["Tên truyện"],

                slug: row.slug ?? row["Slug"],

                trang_thai:
                    row.trang_thai ?? row["Trạng thái"] ?? "dang_tien_hanh",

                moTa: row.moTa ?? row["Mô tả"] ?? "",
            };

            const parsed = storyImportSchema.safeParse(rawData);

            if (!parsed.success) {
                errors.push({
                    row: excelRow,
                    field: parsed.error.issues[0].path.join("."),
                    message: parsed.error.issues[0].message,
                    data: row,
                });

                continue;
            }

            const slugKey = parsed.data.slug.toLowerCase();

            if (seenSlugs.has(slugKey)) {
                errors.push({
                    row: excelRow,
                    field: "slug",
                    message: "Slug bị trùng trong file",
                    data: row,
                });

                continue;
            }

            seenSlugs.add(slugKey);

            validData.push({
                excelRow,
                tenTruyen: parsed.data.tenTruyen,
                slug: parsed.data.slug,
                moTa: parsed.data.moTa || null,
                trang_thai: parsed.data.trang_thai,
            });
        }

        if (!validData.length) {
            return NextResponse.json({
                success: false,
                message: "Không có dòng hợp lệ để import",
                totalRows: rows.length,
                insertedRows: 0,
                errorRows: errors.length,
                errors,
                requestId,
            });
        }

        const existedStories = await prisma.truyen.findMany({
            where: {
                slug: {
                    in: validData.map((item) => item.slug),
                },
            },
            select: {
                slug: true,
            },
        });

        const existedSlugSet = new Set(
            existedStories.map((item) => item.slug.toLowerCase())
        );

        const insertData = validData
            .filter((item) => {
                const existed = existedSlugSet.has(item.slug.toLowerCase());

                if (existed) {
                    errors.push({
                        row: item.excelRow,
                        field: "slug",
                        message: "Slug đã tồn tại trong database",
                    });
                }

                return !existed;
            })
            .map((item) => ({
                tenTruyen: item.tenTruyen,
                slug: item.slug,
                anhBia: "/images/default-story.jpg",

                moTa: item.moTa,
                trang_thai: item.trang_thai,
            }));

        const chunks = chunkArray(insertData, 300);

        let insertedRows = 0;

        for (const chunk of chunks) {
            const result = await prisma.truyen.createMany({
                data: chunk,
                skipDuplicates: true,
            });

            insertedRows += result.count;
        }

        return NextResponse.json(
            resSuccess({
                message: "Import truyện hoàn tất",
                totalRows: rows.length,
                validRows: validData.length,
                insertedRows,
                skippedRows: errors.length,
                errorRows: errors.length,
                errors,
                requestId,
            })
        );
    } catch (error) {
        console.error(error);

        return NextResponse.json(
            {
                success: false,
                message: "Import truyện thất bại",
                requestId,
            },
            { status: 500 }
        );
    }
}
