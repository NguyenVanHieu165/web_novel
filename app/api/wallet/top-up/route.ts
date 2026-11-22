import type { NextRequest } from "next/server";
import { readerMutationError, readerMutationSuccess, runReaderMutation } from "@/lib/server/reader-mutation";
import { creditDemoWallet, isDemoTopUpEnabled } from "@/lib/server/reader-wallet";
import { demoCoinPackages, demoTopUpRequestSchema } from "@/schemas/reader-wallet.schema";

export async function POST(request: NextRequest) {
  if (!isDemoTopUpEnabled()) return readerMutationError("Nạp xu mô phỏng chỉ có trong môi trường phát triển.", 404);
  return runReaderMutation(request, demoTopUpRequestSchema, async (idTaiKhoan, { packageId }) => {
    const result = await creditDemoWallet(idTaiKhoan, demoCoinPackages[packageId]);
    if (result === "cooldown") return readerMutationError("Đợi vài giây trước khi nạp tiếp.", 429);
    if (result === "limit") return readerMutationError("Ví đã đạt giới hạn nạp xu.", 409);
    return readerMutationSuccess("Đã nạp xu mô phỏng.");
  });
}
