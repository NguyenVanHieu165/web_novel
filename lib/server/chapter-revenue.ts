import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import { getStoryOwner } from "@/lib/server/studio-ownership";

type AuthorRevenue = { ownerId: number; amount: number; balance: number };

/** Wallets store whole coins: the author's 70% share rounds down per purchase. */
export function authorRevenueCoins(price: number) {
  if (!Number.isSafeInteger(price) || price < 0 || price > 2_147_483_647) {
    throw new Error("Invalid chapter price");
  }
  return Math.floor(price * 70 / 100);
}

/** All participating wallets are locked in account-id order, including cross-purchases. */
export async function lockChapterWallets(
  tx: Prisma.TransactionClient,
  buyerId: number,
  storyId: number,
  price: number,
): Promise<AuthorRevenue | null> {
  const owner = await getStoryOwner(tx, storyId);
  const amount = authorRevenueCoins(price);
  const authorId = owner && owner.ownerId !== buyerId && amount > 0 ? owner.ownerId : null;
  const accountIds = authorId ? [buyerId, authorId].sort((a, b) => a - b) : [buyerId];
  let revenue: AuthorRevenue | null = null;
  for (const accountId of accountIds) {
    if (accountId === authorId) {
      await tx.viTien.upsert({
        where: { idTaiKhoan: accountId },
        create: { idTaiKhoan: accountId, soDuXu: 0, tongNapXu: 0 },
        update: {},
        select: { idTaiKhoan: true },
      });
    }
    const rows = await tx.$queryRaw<Array<{ balance: number | bigint | null }>>`
      SELECT so_du_xu AS balance FROM vi_tien
      WHERE idTAI_KHOAN = ${accountId} FOR UPDATE
    `;
    if (accountId === authorId) {
      const balance = Number(rows[0]?.balance ?? 0);
      if (!rows.length || !Number.isSafeInteger(balance) || balance < 0 || balance + amount > 4_294_967_295) {
        throw new Error("Author wallet cannot receive revenue");
      }
      revenue = { ownerId: accountId, amount, balance };
    }
  }
  return revenue;
}

export async function creditChapterAuthor(
  tx: Prisma.TransactionClient,
  chapterId: number,
  revenue: AuthorRevenue | null,
) {
  if (!revenue) return;
  const balance = revenue.balance + revenue.amount;
  await tx.viTien.update({
    where: { idTaiKhoan: revenue.ownerId },
    data: { soDuXu: balance },
    select: { idTaiKhoan: true },
  });
  // Positive mua_chuong rows distinguish author earnings from negative reader debits.
  await tx.lichSuGiaoDich.create({
    data: {
      idTaiKhoan: revenue.ownerId,
      loai: "mua_chuong",
      id_doi_tuong: chapterId,
      so_xu_thay_doi: revenue.amount,
      soDuTruoc: revenue.balance,
      soDuSau: balance,
    },
  });
}
