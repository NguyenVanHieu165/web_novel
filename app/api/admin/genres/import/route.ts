import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { revalidatePublicStories } from "@/lib/server/public-cache";
import { getRequestId, resSuccess } from "@/lib/api";
import { requireAdmin } from "@/lib/server/auth-session";
import { validateSpreadsheetFile, validateSpreadsheetRows } from "@/lib/server/spreadsheet-upload";
import { MAX_SPREADSHEET_REQUEST_BYTES, rejectOversizeUpload } from "@/lib/server/upload-size";

const genreImportSchema = z.object({
  tenTheLoai: z
    .string()
    .trim()
    .min(2, "Tên thể loại phải có ít nhất 2 ký tự")
    .max(100, "Tên thể loại không vượt quá 100 ký tự"),
  moTa: z.string().trim().optional().or(z.literal("")),
});

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
        { status: 400 }
      );
    }

    const fileError = validateSpreadsheetFile(file);
    if (fileError) {
      return NextResponse.json({ success: false, message: fileError, requestId }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      return NextResponse.json(
        {
          success: false,
          message: "File Excel rỗng",
          requestId,
        },
        { status: 400 }
      );
    }

    const sheet = workbook.Sheets[sheetName];
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet);

    const rowError = validateSpreadsheetRows(rows.length);
    if (rowError) {
      return NextResponse.json({ success: false, message: rowError, requestId }, { status: 400 });
    }

    if (!rows.length) {
      return NextResponse.json(
        {
          success: false,
          message: "File Excel không có dữ liệu",
          requestId,
        },
        { status: 400 }
      );
    }

    const validData: {
      tenTheLoai: string;
      moTa: string | null;
    }[] = [];

    const errors: {
      row: number;
      field?: string;
      message: string;
    }[] = [];

    const seenNames = new Set<string>();

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const excelRow = index + 2;

      const rawData = {
        tenTheLoai:
          row.tenTheLoai ??
          row["Tên thể loại"] ??
          row.name ??
          row["Name"] ??
          "",
        moTa:
          row.moTa ??
          row["Mô tả"] ??
          row.description ??
          row["Description"] ??
          "",
      };

      const parsed = genreImportSchema.safeParse(rawData);

      if (!parsed.success) {
        errors.push({
          row: excelRow,
          field: parsed.error.issues[0]?.path.join("."),
          message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ",
        });
        continue;
      }

      const nameKey = parsed.data.tenTheLoai.toLowerCase();

      if (seenNames.has(nameKey)) {
        errors.push({
          row: excelRow,
          field: "tenTheLoai",
          message: "Tên thể loại bị trùng trong file",
        });
        continue;
      }

      seenNames.add(nameKey);

      validData.push({
        tenTheLoai: parsed.data.tenTheLoai,
        moTa: parsed.data.moTa || null,
      });
    }

    const existingGenres = await prisma.theLoai.findMany({
      where: { tenTheLoai: { in: validData.map(({ tenTheLoai }) => tenTheLoai) } },
      select: { tenTheLoai: true },
    });
    const existingNames = new Set(existingGenres.map(({ tenTheLoai }) => tenTheLoai.toLowerCase()));
    const insertData = validData.filter((item) => {
      if (!existingNames.has(item.tenTheLoai.toLowerCase())) return true;
      errors.push({
        row: 0,
        field: "tenTheLoai",
        message: `Thể loại "${item.tenTheLoai}" đã tồn tại trong hệ thống`,
      });
      return false;
    });
    const result = insertData.length
      ? await prisma.theLoai.createMany({ data: insertData, skipDuplicates: true })
      : { count: 0 };
    const insertedCount = result.count;
    if (insertedCount) revalidatePublicStories(undefined, true);

    return NextResponse.json(
      resSuccess(
        {
          totalRows: rows.length,
          insertedRows: insertedCount,
          errorRows: errors.length,
          errors,
        },
        {
          message: "Xử lý file hoàn tất",
          requestId,
        }
      )
    );
  } catch (error) {
    console.error("Genre import error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Lỗi hệ thống khi import thể loại",
        requestId,
      },
      { status: 500 }
    );
  }
}
