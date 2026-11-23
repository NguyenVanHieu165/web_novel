import "server-only";

import { randomInt, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  createTopUpRequestNotifications,
  createTopUpSuccessNotification,
} from "@/lib/server/notifications";
import {
  topUpCodeSchema,
  topUpPackages,
  type SepayWebhookInput,
  type TopUpPackageId,
} from "@/lib/server/topup-packages";

const maxUnsignedInt = 4_294_967_295;
const referenceAttempts = 8;
const referencePattern = /NVH\d{6}/i;

const sepayBankAccountSchema = z.strictObject({
  bankCode: z.string().trim().min(1).max(30),
  accountNumber: z.string().trim().min(1).max(50),
  accountName: z.string().trim().min(1).max(150),
});

const webhookApiKeySchema = z.string().trim().min(1).max(500);

export class TopUpConfigurationError extends Error {}

function prismaErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function generateReferenceCode() {
  return `NVH${randomInt(0, 1_000_000).toString().padStart(6, "0")}`;
}

export function getSepayBankAccount() {
  const result = sepayBankAccountSchema.safeParse({
    bankCode: process.env.SEPAY_BANK_CODE,
    accountNumber: process.env.SEPAY_ACCOUNT_NUMBER,
    accountName: process.env.SEPAY_ACCOUNT_NAME,
  });

  if (!result.success) throw new TopUpConfigurationError("Cấu hình tài khoản nhận tiền chưa đầy đủ.");
  return result.data;
}

export function getSepayWebhookApiKey() {
  const result = webhookApiKeySchema.safeParse(process.env.SEPAY_WEBHOOK_API_KEY);
  if (!result.success) throw new TopUpConfigurationError("Cấu hình webhook SePay chưa đầy đủ.");
  return result.data;
}

export function buildSepayQrUrl(input: {
  bankCode: string;
  accountNumber: string;
  amountVnd: number;
  referenceCode: string;
}) {
  const url = new URL("https://qr.sepay.vn/img");
  url.searchParams.set("acc", input.accountNumber);
  url.searchParams.set("bank", input.bankCode);
  url.searchParams.set("amount", String(input.amountVnd));
  url.searchParams.set("des", input.referenceCode);
  return url.toString();
}

export function isValidSepayAuthorization(value: string | null, apiKey: string) {
  if (!value) return false;

  return [apiKey, `Apikey ${apiKey}`].some((candidate) => {
    const received = Buffer.from(value);
    const expected = Buffer.from(candidate);
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

export function extractTopUpCode(payload: Pick<SepayWebhookInput, "code" | "content">) {
  for (const value of [payload.code, payload.content]) {
    const match = value?.match(referencePattern)?.[0];
    if (!match) continue;

    const parsed = topUpCodeSchema.safeParse(match);
    if (parsed.success) return parsed.data;
  }

  return null;
}

export async function createTopUpOrder(idTaiKhoan: number, packageId: TopUpPackageId) {
  const selectedPackage = topUpPackages[packageId];

  for (let attempt = 0; attempt < referenceAttempts; attempt += 1) {
    const referenceCode = generateReferenceCode();
    try {
      const result = await prisma.$transaction(async (tx) => {
        const account = await tx.taiKhoan.findUniqueOrThrow({
          where: { idTaiKhoan },
          select: { tenTaiKhoan: true },
        });
        const order = await tx.hoaDonNap.create({
          data: {
            idTaiKhoan,
            maGiaoDich: referenceCode,
            so_xu_nap: selectedPackage.totalCoins,
            soTienVnd: selectedPackage.amountVnd,
            trang_thai: "pending",
            phuongThuc: "bank",
            ghiChu: `${selectedPackage.id} - ${selectedPackage.name}`,
          },
          select: {
            idHoaDonNap: true,
            idTaiKhoan: true,
            maGiaoDich: true,
            so_xu_nap: true,
            soTienVnd: true,
            trang_thai: true,
            createdAt: true,
          },
        });
        const notification = await createTopUpRequestNotifications(tx, order, account);
        return { order, notification };
      });

      return { ...result, selectedPackage };
    } catch (error) {
      if (prismaErrorCode(error) !== "P2002") throw error;
    }
  }

  throw new Error("Unable to allocate a unique top-up reference code");
}

export function findTopUpOrder(idTaiKhoan: number, referenceCode: string) {
  return prisma.hoaDonNap.findFirst({
    where: { idTaiKhoan, maGiaoDich: referenceCode },
    select: {
      idHoaDonNap: true,
      maGiaoDich: true,
      so_xu_nap: true,
      soTienVnd: true,
      trang_thai: true,
      createdAt: true,
      ngay_xac_nhan: true,
    },
  });
}

type CreditableTopUpOrder = {
  idHoaDonNap: number;
  idTaiKhoan: number;
  maGiaoDich: string | null;
  so_xu_nap: number;
  soTienVnd: number | { toString(): string };
  trang_thai: string | null;
};

async function creditTopUpOrder(order: CreditableTopUpOrder) {
  if (order.trang_thai === "success") return { kind: "already_processed" } as const;
  if (order.trang_thai !== "pending") return { kind: "inactive" } as const;

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const claimed = await tx.hoaDonNap.updateMany({
      where: {
        idHoaDonNap: order.idHoaDonNap,
        trang_thai: "pending",
      },
      data: { trang_thai: "success", ngay_xac_nhan: now },
    });

    if (claimed.count !== 1) return { kind: "already_processed" } as const;

    await tx.$executeRaw`
      INSERT INTO vi_tien (idTAI_KHOAN, so_du_xu, tong_nap_xu) VALUES (${order.idTaiKhoan}, 0, 0)
      ON DUPLICATE KEY UPDATE idTAI_KHOAN = idTAI_KHOAN
    `;
    const [wallet] = await tx.$queryRaw<Array<{
      balance: number | bigint | null;
      totalTopUp: number | bigint | null;
    }>>`
      SELECT so_du_xu AS balance, tong_nap_xu AS totalTopUp
      FROM vi_tien WHERE idTAI_KHOAN = ${order.idTaiKhoan} FOR UPDATE
    `;
    if (!wallet) throw new Error("Wallet unavailable after initialization");

    const before = Number(wallet.balance ?? 0);
    const totalBefore = Number(wallet.totalTopUp ?? 0);
    const after = before + order.so_xu_nap;
    const totalAfter = totalBefore + order.so_xu_nap;
    if (![before, totalBefore, after, totalAfter].every(Number.isSafeInteger) ||
        after > maxUnsignedInt || totalAfter > maxUnsignedInt) {
      throw new Error("Wallet value exceeds supported range");
    }

    await tx.viTien.update({
      where: { idTaiKhoan: order.idTaiKhoan },
      data: { soDuXu: after, tongNapXu: totalAfter },
      select: { idTaiKhoan: true },
    });
    await tx.lichSuGiaoDich.create({
      data: {
        idTaiKhoan: order.idTaiKhoan,
        loai: "nap_xu",
        id_doi_tuong: order.idHoaDonNap,
        so_xu_thay_doi: order.so_xu_nap,
        soDuTruoc: before,
        soDuSau: after,
        createdAt: now,
      },
      select: { idLichSuGiaoDich: true },
    });
    const notification = await createTopUpSuccessNotification(tx, order, after);

    return { kind: "credited", balance: after, creditedCoins: order.so_xu_nap, notification } as const;
  });
}

export async function confirmSepayTopUp(referenceCode: string, transferAmount: number) {
  const order = await prisma.hoaDonNap.findUnique({
    where: { maGiaoDich: referenceCode },
    select: {
      idHoaDonNap: true,
      idTaiKhoan: true,
      maGiaoDich: true,
      so_xu_nap: true,
      soTienVnd: true,
      trang_thai: true,
    },
  });

  if (!order) return { kind: "not_found" } as const;

  const expectedAmount = Number(order.soTienVnd);
  if (!Number.isSafeInteger(expectedAmount) || expectedAmount !== transferAmount) {
    return { kind: "amount_mismatch", expectedAmount } as const;
  }
  return creditTopUpOrder(order);
}

export async function confirmAdminTopUp(idHoaDonNap: number) {
  const order = await prisma.hoaDonNap.findUnique({
    where: { idHoaDonNap },
    select: {
      idHoaDonNap: true,
      idTaiKhoan: true,
      maGiaoDich: true,
      so_xu_nap: true,
      soTienVnd: true,
      trang_thai: true,
    },
  });
  if (!order) return { kind: "not_found" } as const;
  return creditTopUpOrder(order);
}

export async function cancelAdminTopUp(idHoaDonNap: number) {
  const cancelled = await prisma.hoaDonNap.updateMany({
    where: { idHoaDonNap, trang_thai: "pending" },
    data: { trang_thai: "cancelled" },
  });
  if (cancelled.count === 1) return { kind: "cancelled" } as const;

  const order = await prisma.hoaDonNap.findUnique({
    where: { idHoaDonNap },
    select: { trang_thai: true },
  });
  if (!order) return { kind: "not_found" } as const;
  return { kind: "inactive", status: order.trang_thai } as const;
}
