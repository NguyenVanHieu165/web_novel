import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import * as z from "zod";

import { prisma } from "@/lib/prisma";
import { getRequestId, resSuccess } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { requireAdmin } from "@/lib/server/auth-session";
import { isSameOriginAccountWrite, resolveAccountRole } from "@/lib/server/account-roles";
import { validateSpreadsheetFile, validateSpreadsheetRows } from "@/lib/server/spreadsheet-upload";
import { MAX_SPREADSHEET_REQUEST_BYTES, rejectOversizeUpload } from "@/lib/server/upload-size";

const DEFAULT_PASSWORD = process.env.ADMIN_IMPORTED_USER_PASSWORD;

const userImportSchema = z.object({
  tenTaikhoan: z.string().trim().min(1, "Tên tài khoản không được để trống"),
  email: z.string().trim().email("Email không hợp lệ"),
  trangThai: z.enum(["active", "locked", "banned"]).default("active"),
});

type UserImportRow = z.infer<typeof userImportSchema> & {
  excelRow: number;
};

function chunkArray<T>(array: T[], size: number) {
  const result: T[][] = [];

  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }

  return result;
}

export async function POST(req: NextRequest) {
  if (!isSameOriginAccountWrite(req)) return NextResponse.json({ message: "Yêu cầu không hợp lệ." }, { status: 403 });
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;
  const tooLarge = rejectOversizeUpload(req, MAX_SPREADSHEET_REQUEST_BYTES);
  if (tooLarge) return tooLarge;

  const requestId = getRequestId();

  try {
    if (!DEFAULT_PASSWORD) {
      return NextResponse.json(
        { success: false, message: "ADMIN_IMPORTED_USER_PASSWORD chưa được cấu hình", requestId },
        { status: 500 },
      );
    }

    const defaultPasswordHash = await hashPassword(DEFAULT_PASSWORD);
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

    const validData: UserImportRow[] = [];
    const errors: {
      row: number;
      field?: string;
      message: string;
      data?: Record<string, unknown>;
    }[] = [];
    const seenUsernames = new Set<string>();
    const seenEmails = new Set<string>();

    rows.forEach((row, index) => {
      const excelRow = index + 2;
      const rawData = {
        tenTaikhoan: row.tenTaikhoan ?? row.tenTaiKhoan ?? row["Tên tài khoản"],
        email: row.email ?? row["Email"],
        trangThai: row.trangThai ?? row["Trạng thái"] ?? "active",
      };
      const parsed = userImportSchema.safeParse(rawData);

      if (!parsed.success) {
        errors.push({
          row: excelRow,
          field: parsed.error.issues[0].path.join("."),
          message: parsed.error.issues[0].message,
          data: row,
        });
        return;
      }

      const usernameKey = parsed.data.tenTaikhoan.toLowerCase();
      const emailKey = parsed.data.email.toLowerCase();

      if (seenUsernames.has(usernameKey) || seenEmails.has(emailKey)) {
        errors.push({
          row: excelRow,
          field: seenUsernames.has(usernameKey) ? "tenTaikhoan" : "email",
          message: "Dữ liệu bị trùng trong file",
          data: row,
        });
        return;
      }

      seenUsernames.add(usernameKey);
      seenEmails.add(emailKey);
      validData.push({
        ...parsed.data,
        excelRow,
      });
    });

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

    const existedUsers = await prisma.taiKhoan.findMany({
      where: {
        OR: [
          {
            tenTaiKhoan: {
              in: validData.map((item) => item.tenTaikhoan),
            },
          },
          {
            email: {
              in: validData.map((item) => item.email),
            },
          },
        ],
      },
      select: {
        tenTaiKhoan: true,
        email: true,
      },
    });
    const existedUsernameSet = new Set(
      existedUsers.map((item) => item.tenTaiKhoan.toLowerCase()),
    );
    const existedEmailSet = new Set(
      existedUsers.map((item) => item.email.toLowerCase()),
    );
    const insertData = validData
      .filter((item) => {
        const usernameExisted = existedUsernameSet.has(item.tenTaikhoan.toLowerCase());
        const emailExisted = existedEmailSet.has(item.email.toLowerCase());

        if (usernameExisted || emailExisted) {
          errors.push({
            row: item.excelRow,
            field: usernameExisted ? "tenTaikhoan" : "email",
            message: "Người dùng đã tồn tại trong database",
          });
        }

        return !usernameExisted && !emailExisted;
      })
      .map((item) => ({
        tenTaiKhoan: item.tenTaikhoan,
        email: item.email,
        trangThai: item.trangThai,
        matKhau: defaultPasswordHash,
      }));

    let insertedRows = 0;

    for (const chunk of chunkArray(insertData, 300)) {
      const insertedCount = await prisma.$transaction(async (tx) => {
        const defaultRole = await resolveAccountRole(tx);
        const result = await tx.taiKhoan.createMany({
          data: chunk,
          skipDuplicates: true,
        });

        if (!result.count) return 0;
        // The salted hash belongs to this import and excludes accounts inserted concurrently elsewhere.
        const accounts = await tx.taiKhoan.findMany({
          where: { email: { in: chunk.map(({ email }) => email) }, matKhau: defaultPasswordHash },
          select: { idTaiKhoan: true },
        });
        if (accounts.length !== result.count) throw new Error("Imported accounts could not be verified");

        await tx.vaiTroNguoiDung.createMany({
          data: accounts.map(({ idTaiKhoan }) => ({
            idTaiKhoan,
            idVaiTro: defaultRole.idVaiTro,
          })),
          skipDuplicates: true,
        });

        await tx.viTien.createMany({
          data: accounts.map(({ idTaiKhoan }) => ({
            idTaiKhoan,
            soDuXu: 0,
            tongNapXu: 0,
          })),
          skipDuplicates: true,
        });

        return result.count;
      });

      insertedRows += insertedCount;
    }

    return NextResponse.json(
      resSuccess({
        message: "Import người dùng hoàn tất",
        totalRows: rows.length,
        insertedRows,
        errorRows: errors.length,
        errors,
        requestId,
      }),
    );
  } catch (error) {
    console.error("IMPORT USERS ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Import người dùng thất bại",
        requestId,
      },
      { status: 500 },
    );
  }
}
