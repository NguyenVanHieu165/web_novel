import "server-only";

import { z } from "zod";

export const topUpPackageIdSchema = z.enum([
  "starter_10k",
  "basic_20k",
  "popular_50k",
  "value_100k",
  "vip_200k",
  "master_500k",
]);

const topUpPackageSchema = z.strictObject({
  id: topUpPackageIdSchema,
  name: z.string().trim().min(1).max(100),
  amountVnd: z.number().int().positive().max(500_000),
  baseCoins: z.number().int().positive(),
  bonusCoins: z.number().int().nonnegative(),
  totalCoins: z.number().int().positive(),
  badge: z.string().trim().min(1).max(50).nullable(),
});

const topUpPackageListSchema = z.array(topUpPackageSchema).length(6).superRefine((packages, context) => {
  const ids = new Set<string>();

  packages.forEach((item, index) => {
    if (ids.has(item.id)) {
      context.addIssue({ code: "custom", message: "Mã gói nạp bị trùng.", path: [index, "id"] });
    }
    ids.add(item.id);

    if (item.totalCoins !== item.baseCoins + item.bonusCoins) {
      context.addIssue({
        code: "custom",
        message: "Tổng xu phải bằng xu cơ bản cộng xu thưởng.",
        path: [index, "totalCoins"],
      });
    }
  });
});

const packageList = topUpPackageListSchema.parse([
  { id: "starter_10k", name: "Gói Trải Nghiệm", amountVnd: 10_000, baseCoins: 100, bonusCoins: 0, totalCoins: 100, badge: null },
  { id: "basic_20k", name: "Gói Đọc Nhanh", amountVnd: 20_000, baseCoins: 200, bonusCoins: 10, totalCoins: 210, badge: null },
  { id: "popular_50k", name: "Gói Phổ Biến", amountVnd: 50_000, baseCoins: 500, bonusCoins: 50, totalCoins: 550, badge: "Phổ biến" },
  { id: "value_100k", name: "Gói Cày Truyện", amountVnd: 100_000, baseCoins: 1_000, bonusCoins: 150, totalCoins: 1_150, badge: "Tiết kiệm" },
  { id: "vip_200k", name: "Gói Đại Hiệp", amountVnd: 200_000, baseCoins: 2_000, bonusCoins: 400, totalCoins: 2_400, badge: "Giá tốt nhất" },
  { id: "master_500k", name: "Gói Tông Sư", amountVnd: 500_000, baseCoins: 5_000, bonusCoins: 1_250, totalCoins: 6_250, badge: "Siêu ưu đãi" },
]);

export type TopUpPackageId = z.infer<typeof topUpPackageIdSchema>;
export type TopUpPackage = z.infer<typeof topUpPackageSchema>;

export const topUpPackages = Object.freeze(Object.fromEntries(
  packageList.map((item) => [item.id, Object.freeze(item)]),
) as Record<TopUpPackageId, Readonly<TopUpPackage>>);

export const topUpRequestSchema = z.strictObject({
  packageId: topUpPackageIdSchema,
});

export const topUpCodeSchema = z.string().trim().regex(/^NVH\d{6}$/i).transform((code) => code.toUpperCase());

export const sepayWebhookSchema = z.object({
  id: z.union([
    z.string().trim().min(1).max(100),
    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).transform(String),
  ]),
  accountNumber: z.string().trim().min(1).max(50),
  code: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  transferAmount: z.coerce.number().int().positive().max(999_999_999_999),
  transferType: z.string().trim().toLowerCase().pipe(z.enum(["in", "out"])),
}).passthrough();

export type SepayWebhookInput = z.infer<typeof sepayWebhookSchema>;
