import { z } from "zod";

export const demoCoinPackages = {
  small: 20,
  medium: 50,
  large: 100,
} as const;

// Package IDs are validated independently of their server-owned amounts.
export const demoTopUpRequestSchema = z.strictObject({
  packageId: z.enum(["small", "medium", "large"]),
});

export const walletPageSchema = z.string().regex(/^\d{1,9}$/).transform(Number).pipe(z.number().int().positive());

export type DemoTopUpInput = z.infer<typeof demoTopUpRequestSchema>;
