import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/auth-session";
import { creditChapterAuthor, lockChapterWallets } from "@/lib/server/chapter-revenue";

const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
const purchaseSchema = z.strictObject({
  expectedPrice: z.number().int().positive().max(2_147_483_647),
});

const getErrorCode = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const origin = request.headers.get("origin");
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin !== null && origin !== request.nextUrl.origin)
  ) {
    return NextResponse.json({ success: false, message: "Yêu cầu mua chương không hợp lệ" }, { status: 403 });
  }

  try {
    const auth = await requireUser(request);
    if (!auth.authorized) return auth.response;
    if (auth.user.roles.includes("admin")) {
      return NextResponse.json(
        { success: false, message: "Tài khoản quản trị đã có quyền đọc chương" },
        { status: 403 },
      );
    }

    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { success: false, message: "ID chương không hợp lệ" },
        { status: 400 },
      );
    }

    const chapterId = parsedParams.data.id;
    const parsedBody = purchaseSchema.safeParse(await request.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json({ success: false, message: "Thông tin xác nhận mua chương không hợp lệ" }, { status: 400 });
    }
    const expectedPrice = parsedBody.data.expectedPrice;

    const result = await prisma.$transaction(async (tx) => {
      const chapterRows = await tx.$queryRaw<Array<{
        idChuong: number;
        idTruyen: number;
        isFree: boolean | number | null;
        giaXu: number | bigint | null;
        contentReady: number | bigint;
      }>>`
        SELECT c.idCHUONG AS idChuong, c.idTRUYEN AS idTruyen, c.is_free AS isFree, c.gia_xu AS giaXu,
          EXISTS (
            SELECT 1 FROM noi_dung_chuong AS n
            WHERE n.idCHUONG = c.idCHUONG AND n.content_type = 'db'
              AND CHAR_LENGTH(TRIM(COALESCE(n.noi_dung, ''))) > 0
          ) AS contentReady
        FROM chuong AS c
        INNER JOIN truyen AS t ON t.idTRUYEN = c.idTRUYEN
        WHERE c.idCHUONG = ${chapterId} AND c.is_deleted = 0 AND t.is_deleted = 0
        FOR UPDATE
      `;
      const chapter = chapterRows[0];

      if (!chapter) return { kind: "not_found" } as const;
      if (chapter.isFree ?? true) return { kind: "free" } as const;

      const existingPurchase = await tx.chuongDaMua.findUnique({
        where: {
          idTaiKhoan_idChuong: {
            idTaiKhoan: auth.user.idTaiKhoan,
            idChuong: chapter.idChuong,
          },
        },
        select: { idChuong: true },
      });

      if (existingPurchase) return { kind: "already_purchased" } as const;
      if (!chapter.contentReady) return { kind: "unavailable" } as const;

      const price = Number(chapter.giaXu ?? 0);
      if (!Number.isSafeInteger(price) || price <= 0 || price > 2_147_483_647) {
        return { kind: "invalid_price" } as const;
      }
      // Client price is a consent check only; the charged price always comes from DB.
      if (price !== expectedPrice) return { kind: "price_changed", price } as const;

      const revenue = await lockChapterWallets(tx, auth.user.idTaiKhoan, chapter.idTruyen, price);
      const debitedRows = await tx.$executeRaw`
        UPDATE vi_tien
        SET so_du_xu = so_du_xu - ${price}, updated_at = CURRENT_TIMESTAMP
        WHERE idTAI_KHOAN = ${auth.user.idTaiKhoan} AND so_du_xu >= ${price}
      `;
      if (debitedRows !== 1) return { kind: "insufficient" } as const;

      const walletRows = await tx.$queryRaw<Array<{ balance: number | bigint }>>`
        SELECT so_du_xu AS balance
        FROM vi_tien
        WHERE idTAI_KHOAN = ${auth.user.idTaiKhoan}
        FOR UPDATE
      `;
      const balance = Number(walletRows[0]?.balance);
      if (!Number.isSafeInteger(balance) || balance < 0) {
        throw new Error("Wallet balance unavailable after debit");
      }

      await tx.chuongDaMua.create({
        data: {
          idTaiKhoan: auth.user.idTaiKhoan,
          idChuong: chapter.idChuong,
        },
      });

      await tx.lichSuGiaoDich.create({
        data: {
          idTaiKhoan: auth.user.idTaiKhoan,
          loai: "mua_chuong",
          id_doi_tuong: chapter.idChuong,
          so_xu_thay_doi: -price,
          soDuTruoc: balance + price,
          soDuSau: balance,
        },
      });

      await creditChapterAuthor(tx, chapter.idChuong, revenue);

      return { kind: "purchased", balance } as const;
    });

    if (result.kind === "not_found") {
      return NextResponse.json({ success: false, message: "Không tìm thấy chương" }, { status: 404 });
    }
    if (result.kind === "free") {
      return NextResponse.json({ success: false, message: "Chương này miễn phí" }, { status: 409 });
    }
    if (result.kind === "invalid_price") {
      return NextResponse.json({ success: false, message: "Chương chưa có giá xu hợp lệ" }, { status: 409 });
    }
    if (result.kind === "unavailable") {
      return NextResponse.json(
        { success: false, message: "Nội dung chương chưa sẵn sàng để mở khóa. Vui lòng quay lại sau." },
        { status: 409 },
      );
    }
    if (result.kind === "price_changed") {
      return NextResponse.json(
        { success: false, code: "PRICE_CHANGED", message: "Giá chương đã thay đổi. Vui lòng xác nhận lại giá mới.", price: result.price },
        { status: 409 },
      );
    }
    if (result.kind === "insufficient") {
      const wallet = await prisma.viTien.findUnique({
        where: { idTaiKhoan: auth.user.idTaiKhoan },
        select: { soDuXu: true },
      });
      return NextResponse.json(
        { success: false, message: "Ví không đủ xu để mở khóa chương", balance: wallet?.soDuXu ?? 0 },
        { status: 409 },
      );
    }

    if (result.kind === "already_purchased") {
      const wallet = await prisma.viTien.findUnique({
        where: { idTaiKhoan: auth.user.idTaiKhoan },
        select: { soDuXu: true },
      });
      return NextResponse.json({ success: true, alreadyUnlocked: true, balance: wallet?.soDuXu ?? 0 });
    }

    return NextResponse.json({ success: true, alreadyUnlocked: false, balance: result.balance });
  } catch (error) {
    if (["P2002", "P2034"].includes(getErrorCode(error) ?? "")) {
      // A rolled-back contention error is safe to retry; no partial charge is committed.
      return NextResponse.json(
        { success: false, message: "Giao dịch đang được xử lý. Vui lòng thử lại." },
        { status: 409 },
      );
    }

    console.error("PURCHASE CHAPTER ERROR:", error);
    return NextResponse.json(
      { success: false, message: "Không thể mở khóa chương. Vui lòng thử lại." },
      { status: 500 },
    );
  }
}
