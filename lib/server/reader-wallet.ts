import "server-only";

import { prisma } from "@/lib/prisma";

export function isDemoTopUpEnabled() {
  return process.env.NODE_ENV === "development";
}

const maxWalletValue = 4_294_967_295;
const demoCooldownMs = 5_000;

export function creditDemoWallet(idTaiKhoan: number, amount: number) {
  return prisma.$transaction(async (tx) => {
    // Initialize accounts without a wallet and serialize credits with chapter debits.
    await tx.$executeRaw`
      INSERT INTO vi_tien (idTAI_KHOAN, so_du_xu, tong_nap_xu) VALUES (${idTaiKhoan}, 0, 0)
      ON DUPLICATE KEY UPDATE idTAI_KHOAN = idTAI_KHOAN
    `;
    const [wallet] = await tx.$queryRaw<Array<{
      balance: number | bigint | null;
      totalTopUp: number | bigint | null;
    }>>`
      SELECT so_du_xu AS balance, tong_nap_xu AS totalTopUp
      FROM vi_tien WHERE idTAI_KHOAN = ${idTaiKhoan} FOR UPDATE
    `;
    if (!wallet) throw new Error("Wallet unavailable after initialization");

    const lastTopUp = await tx.lichSuGiaoDich.findFirst({
      where: { idTaiKhoan, loai: "nap_xu" },
      orderBy: [{ createdAt: "desc" }, { idLichSuGiaoDich: "desc" }],
      select: { createdAt: true },
    });
    const now = new Date();
    if (lastTopUp?.createdAt && now.getTime() - lastTopUp.createdAt.getTime() < demoCooldownMs) {
      return "cooldown";
    }

    const before = Number(wallet.balance ?? 0);
    const after = before + amount;
    const totalTopUp = Number(wallet.totalTopUp ?? 0) + amount;
    if (after > maxWalletValue || totalTopUp > maxWalletValue) return "limit";

    await tx.viTien.update({
      where: { idTaiKhoan },
      data: { soDuXu: after, tongNapXu: totalTopUp },
      select: { idTaiKhoan: true },
    });
    await tx.lichSuGiaoDich.create({
      data: { idTaiKhoan, loai: "nap_xu", so_xu_thay_doi: amount, soDuTruoc: before, soDuSau: after, createdAt: now },
      select: { idLichSuGiaoDich: true },
    });
    return "credited";
  });
}
