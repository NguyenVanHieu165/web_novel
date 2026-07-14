import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import * as z from "zod";

import { prisma } from "@/lib/prisma";
import { getRequestId, resSuccess } from "@/lib/api";

const DEFAULT_PASSWORD = "123456";

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

    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(Buffer.from(bytes), {
      type: "buffer",
    });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet);

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
        matKhau: DEFAULT_PASSWORD,
      }));

    let insertedRows = 0;

    for (const chunk of chunkArray(insertData, 300)) {
      const result = await prisma.taiKhoan.createMany({
        data: chunk,
        skipDuplicates: true,
      });

      insertedRows += result.count;
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
