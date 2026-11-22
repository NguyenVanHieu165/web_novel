import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import * as z from "zod";

import { prisma } from "@/lib/prisma";
import { revalidatePublicStories } from "@/lib/server/public-cache";
import { getRequestId, resSuccess } from "@/lib/api";
import { requireAdmin } from "@/lib/server/auth-session";
import { validateSpreadsheetFile, validateSpreadsheetRows } from "@/lib/server/spreadsheet-upload";
import { MAX_SPREADSHEET_REQUEST_BYTES, rejectOversizeUpload } from "@/lib/server/upload-size";

const chapterImportSchema = z.object({
  idTruyen: z.coerce.number().int().positive("Vui lòng nhập ID truyện"),
  chuongSo: z.coerce
    .number()
    .positive("Số chương phải lớn hơn 0")
    .max(9999.9, "Số chương quá lớn"),
  tieuDeChuong: z
    .string()
    .trim()
    .min(1, "Tiêu đề chương không được để trống")
    .max(300, "Tiêu đề chương tối đa 300 ký tự"),
  slug: z.string().trim().min(1, "Slug không được để trống").max(300),
  isFree: z.coerce.boolean().default(true),
  giaXu: z.coerce.number().int().min(0).default(0),
  noiDung: z.string().trim().optional().or(z.literal("")),
});

type ChapterImportRow = z.infer<typeof chapterImportSchema> & {
  excelRow: number;
};

const notDeletedWhere = {
  OR: [{ isDeleted: false }, { isDeleted: null }],
};

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value !== "string") return value;

  const normalized = value.trim().toLowerCase();

  if (["co", "có", "yes", "true", "1", "mien phi", "miễn phí"].includes(normalized)) {
    return true;
  }

  if (["khong", "không", "no", "false", "0", "tra phi", "trả phí"].includes(normalized)) {
    return false;
  }

  return value;
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;
  const tooLarge = rejectOversizeUpload(req, MAX_SPREADSHEET_REQUEST_BYTES);
  if (tooLarge) return tooLarge;

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
        { status: 400 },
      );
    }

    const fileError = validateSpreadsheetFile(file);
    if (fileError) {
      return NextResponse.json({ success: false, message: fileError, requestId }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(Buffer.from(bytes), {
      type: "buffer",
    });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet);

    const rowError = validateSpreadsheetRows(rows.length);
    if (rowError) {
      return NextResponse.json({ success: false, message: rowError, requestId }, { status: 400 });
    }

    if (!rows.length) {
      return NextResponse.json(
        {
          success: false,
          message: "File Excel rỗng",
          requestId,
        },
        { status: 400 },
      );
    }

    const validData: ChapterImportRow[] = [];
    const errors: {
      row: number;
      field?: string;
      message: string;
      data?: Record<string, unknown>;
    }[] = [];
    const seenKeys = new Set<string>();

    rows.forEach((row, index) => {
      const excelRow = index + 2;
      const rawData = {
        idTruyen: row.idTruyen ?? row["ID truyện"],
        chuongSo: row.chuongSo ?? row["Số chương"],
        tieuDeChuong: row.tieuDeChuong ?? row["Tiêu đề"],
        slug: row.slug ?? row["Slug"],
        isFree: normalizeBoolean(row.isFree ?? row["Miễn phí"] ?? true),
        giaXu: row.giaXu ?? row["Giá xu"] ?? 0,
        noiDung: row.noiDung ?? row["Nội dung"] ?? "",
      };
      const parsed = chapterImportSchema.safeParse(rawData);

      if (!parsed.success) {
        errors.push({
          row: excelRow,
          field: parsed.error.issues[0].path.join("."),
          message: parsed.error.issues[0].message,
          data: row,
        });
        return;
      }

      const key = `${parsed.data.idTruyen}:${parsed.data.chuongSo}`;

      if (seenKeys.has(key)) {
        errors.push({
          row: excelRow,
          field: "chuongSo",
          message: "Chương bị trùng trong file",
          data: row,
        });
        return;
      }

      seenKeys.add(key);
      validData.push({
        ...parsed.data,
        excelRow,
      });
    });

    const storyIds = Array.from(new Set(validData.map((item) => item.idTruyen)));
    const existedStories = await prisma.truyen.findMany({
      where: {
        idTruyen: {
          in: storyIds,
        },
        ...notDeletedWhere,
      },
      select: {
        idTruyen: true,
      },
    });
    const existedStoryIds = new Set(existedStories.map((item) => item.idTruyen));
    const insertData = validData
      .filter((item) => {
        const storyExisted = existedStoryIds.has(item.idTruyen);

        if (!storyExisted) {
          errors.push({
            row: item.excelRow,
            field: "idTruyen",
            message: "Truyện không tồn tại",
          });
        }

        return storyExisted;
      })
      .map((item) => ({
        excelRow: item.excelRow,
        idTruyen: item.idTruyen,
        chuongSo: item.chuongSo,
        tieuDeChuong: item.tieuDeChuong,
        slug: item.slug,
        isFree: item.isFree,
        giaXu: item.isFree ? 0 : item.giaXu,
        noiDung: item.noiDung || "",
      }));

    const existingChapters = await prisma.chuong.findMany({
      where: {
        OR: insertData.map(({ idTruyen, chuongSo }) => ({ idTruyen, chuongSo })),
      },
      select: { idTruyen: true, chuongSo: true },
    });
    const existingKeys = new Set(existingChapters.map(({ idTruyen, chuongSo }) => `${idTruyen}:${chuongSo}`));
    const newRows = insertData.filter((item) => {
      if (!existingKeys.has(`${item.idTruyen}:${item.chuongSo}`)) return true;
      errors.push({ row: item.excelRow, field: "chuongSo", message: "Chương đã tồn tại trong hệ thống" });
      return false;
    });

    let insertedRows = 0;

    await prisma.$transaction(async (tx) => {
      for (let offset = 0; offset < newRows.length; offset += 500) {
        const batch = newRows.slice(offset, offset + 500);
        await tx.chuong.createMany({
          data: batch.map(({ idTruyen, chuongSo, tieuDeChuong, slug, isFree, giaXu }) => ({
            idTruyen, chuongSo, tieuDeChuong, slug, isFree, giaXu,
          })),
        });
        insertedRows += batch.length;
      }

      const insertedStoryIds = Array.from(
        new Set(newRows.map((item) => item.idTruyen)),
      );

      const insertedChapters = newRows.length
        ? await tx.chuong.findMany({
            where: { OR: newRows.map(({ idTruyen, chuongSo }) => ({ idTruyen, chuongSo })) },
            select: { idChuong: true, idTruyen: true, chuongSo: true },
          })
        : [];
      const chapterIds = new Map(insertedChapters.map(({ idTruyen, chuongSo, idChuong }) => [`${idTruyen}:${chuongSo}`, idChuong]));
      const contentRows = newRows.flatMap((item) => {
        const idChuong = chapterIds.get(`${item.idTruyen}:${item.chuongSo}`);
        return idChuong && item.noiDung ? [{ idChuong, noiDung: item.noiDung, contentType: "db" as const }] : [];
      });
      for (let offset = 0; offset < contentRows.length; offset += 500) {
        await tx.noiDungChuong.createMany({ data: contentRows.slice(offset, offset + 500) });
      }

      await Promise.all(
        insertedStoryIds.map(async (idTruyen) => {
          const soChuong = await tx.chuong.count({
            where: {
              idTruyen,
              ...notDeletedWhere,
            },
          });

          await tx.truyen.update({
            where: {
              idTruyen,
            },
            data: {
              soChuong,
            },
          });
        }),
      );
    });

    if (insertedRows) revalidatePublicStories();
    return NextResponse.json(
      resSuccess({
        message: "Import chương hoàn tất",
        totalRows: rows.length,
        insertedRows,
        errorRows: errors.length,
        errors,
        requestId,
      }),
    );
  } catch (error) {
    console.error("IMPORT CHAPTERS ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Import chương thất bại",
        requestId,
      },
      { status: 500 },
    );
  }
}
