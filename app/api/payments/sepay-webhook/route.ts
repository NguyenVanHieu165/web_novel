import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { sepayWebhookSchema } from "@/lib/server/topup-packages";
import {
  confirmSepayTopUp,
  extractTopUpCode,
  getSepayBankAccount,
  getSepayWebhookApiKey,
  isValidSepayAuthorization,
  TopUpConfigurationError,
} from "@/lib/server/wallet-topup";

export async function POST(request: NextRequest) {
  try {
    const apiKey = getSepayWebhookApiKey();
    if (!isValidSepayAuthorization(request.headers.get("authorization"), apiKey)) {
      return NextResponse.json({ success: false, message: "Webhook không được xác thực." }, { status: 401 });
    }

    if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      return NextResponse.json({ success: false, message: "Dữ liệu webhook không hợp lệ." }, { status: 415 });
    }

    const payload = sepayWebhookSchema.safeParse(await request.json().catch(() => null));
    if (!payload.success) {
      return NextResponse.json({ success: false, message: "Dữ liệu webhook không hợp lệ." }, { status: 400 });
    }
    if (payload.data.transferType !== "in") {
      return NextResponse.json({ success: true, processed: false, message: "Giao dịch chi không được xử lý." });
    }

    const expectedAccount = getSepayBankAccount().accountNumber.replace(/\s+/g, "");
    if (payload.data.accountNumber.replace(/\s+/g, "") !== expectedAccount) {
      return NextResponse.json({ success: true, processed: false, message: "Giao dịch không thuộc tài khoản nhận tiền." });
    }

    const referenceCode = extractTopUpCode(payload.data);
    if (!referenceCode) {
      return NextResponse.json({ success: false, message: "Không tìm thấy mã đơn nạp hợp lệ." }, { status: 400 });
    }

    const result = await confirmSepayTopUp(referenceCode, payload.data.transferAmount);
    if (result.kind === "not_found") {
      return NextResponse.json({ success: false, message: "Không tìm thấy đơn nạp." }, { status: 404 });
    }
    if (result.kind === "amount_mismatch") {
      return NextResponse.json({ success: false, message: "Số tiền chuyển khoản không khớp đơn nạp." }, { status: 409 });
    }
    if (result.kind === "inactive") {
      return NextResponse.json({ success: false, message: "Đơn nạp không còn ở trạng thái chờ." }, { status: 409 });
    }
    if (result.kind === "already_processed") {
      return NextResponse.json({ success: true, processed: false, message: "Đơn nạp đã được xử lý trước đó." });
    }
    return NextResponse.json({
      success: true,
      processed: true,
      message: "Đã xác nhận đơn nạp và cộng xu.",
      data: { code: referenceCode, creditedCoins: result.creditedCoins, balance: result.balance },
    });
  } catch (error) {
    if (error instanceof TopUpConfigurationError) {
      return NextResponse.json({ success: false, message: "Webhook SePay chưa được cấu hình." }, { status: 503 });
    }

    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "UNKNOWN";
    console.error("SePay webhook processing failed", code);
    return NextResponse.json({ success: false, message: "Không thể xử lý webhook SePay." }, { status: 500 });
  }
}
