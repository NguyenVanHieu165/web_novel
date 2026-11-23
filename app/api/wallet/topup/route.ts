import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { readerMutationError, runReaderMutation } from "@/lib/server/reader-mutation";
import { topUpRequestSchema } from "@/lib/server/topup-packages";
import {
  buildSepayQrUrl,
  createTopUpOrder,
  getSepayBankAccount,
  TopUpConfigurationError,
} from "@/lib/server/wallet-topup";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function POST(request: NextRequest) {
  return runReaderMutation(request, topUpRequestSchema, async (idTaiKhoan, { packageId }) => {
    try {
      const bank = getSepayBankAccount();
      const { order, selectedPackage } = await createTopUpOrder(idTaiKhoan, packageId);
      const referenceCode = order.maGiaoDich;
      if (!referenceCode) throw new Error("Top-up reference code was not persisted");

      return NextResponse.json({
        success: true,
        message: "Đã tạo yêu cầu nạp xu.",
        data: {
          code: referenceCode,
          status: "PENDING",
          package: selectedPackage,
          bank: {
            ...bank,
            amountVnd: selectedPackage.amountVnd,
            transferContent: referenceCode,
            qrUrl: buildSepayQrUrl({
              bankCode: bank.bankCode,
              accountNumber: bank.accountNumber,
              amountVnd: selectedPackage.amountVnd,
              referenceCode,
            }),
          },
          createdAt: order.createdAt?.toISOString() ?? null,
        },
      }, { status: 201, headers: privateHeaders });
    } catch (error) {
      if (error instanceof TopUpConfigurationError) {
        return readerMutationError("Hệ thống nạp xu chưa được cấu hình đầy đủ.", 503);
      }
      throw error;
    }
  });
}
