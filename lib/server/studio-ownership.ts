import "server-only";

import { z } from "zod";
import type { Prisma } from "@/app/generated/prisma/client";

export type StudioActor = { idTaiKhoan: number; roles: string[] };
export type StoryOwner = { ownerId: number; authorId: number };
type OwnershipReader = Pick<Prisma.TransactionClient, "caiDatHeThong" | "truyen" | "taiKhoan">;

export class StudioAccessError extends Error {
  constructor(message: string, public status: number, public code = "STUDIO_ERROR") {
    super(message);
    this.name = "StudioAccessError";
  }
}

export const storyOwnershipKey = (storyId: number) => `studio.story.${storyId}`;
export const accountAuthorKey = (accountId: number) => `studio.author.${accountId}`;
export const storyOwnershipSchema = z.object({
  version: z.literal(1), ownerId: z.number().int().positive(), authorId: z.number().int().positive(),
}).strict();
export const accountAuthorSchema = z.object({ version: z.literal(1), authorId: z.number().int().positive() }).strict();

/** Ownership is assigned only by Studio creation, never inferred from author names. */
export async function getStoryOwner(tx: OwnershipReader, storyId: number): Promise<StoryOwner | null> {
  const record = await tx.caiDatHeThong.findUnique({ where: { khoa: storyOwnershipKey(storyId) }, select: { giaTri: true } });
  if (!record) return null;
  let value: unknown;
  try { value = JSON.parse(record.giaTri); } catch { return null; }
  const parsed = storyOwnershipSchema.safeParse(value);
  if (!parsed.success) return null;
  const { ownerId, authorId } = parsed.data;
  const [story, account] = await Promise.all([
    tx.truyen.findFirst({ where: {
      idTruyen: storyId, nguon: "sang_tac", OR: [{ isDeleted: false }, { isDeleted: null }],
      truyen_tac_gia_dich: { some: { idTAC_GIA_DICH: authorId, vai_tro: "tac_gia_chinh", tac_gia_dich: { loai: { in: ["tac_gia", "both"] } } } },
    }, select: { idTruyen: true } }),
    tx.taiKhoan.findFirst({ where: { idTaiKhoan: ownerId, trangThai: "active", OR: [{ isDeleted: false }, { isDeleted: null }] }, select: { idTaiKhoan: true } }),
  ]);
  return story && account ? { ownerId, authorId } : null;
}

export async function assertStudioStoryAccess(tx: OwnershipReader, actor: StudioActor, storyId: number) {
  const story = await tx.truyen.findFirst({ where: { idTruyen: storyId, OR: [{ isDeleted: false }, { isDeleted: null }] },
    select: { idTruyen: true, tenTruyen: true, slug: true } });
  if (!story) throw new StudioAccessError("Không tìm thấy truyện.", 404, "STORY_NOT_FOUND");
  if (!actor.roles.includes("admin")) {
    const owner = await getStoryOwner(tx, storyId);
    if (!owner || owner.ownerId !== actor.idTaiKhoan) {
      throw new StudioAccessError("Bạn không có quyền quản lý truyện này.", 403, "FORBIDDEN");
    }
  }
  return story;
}

export async function ensureStudioDatabase(tx: Pick<Prisma.TransactionClient, "$queryRaw">) {
  const result = await tx.$queryRaw<Array<{ databaseName: string | null }>>`SELECT DATABASE() AS databaseName`;
  if (result[0]?.databaseName !== "web_truyen") {
    throw new StudioAccessError("Kết nối database ứng dụng không hợp lệ.", 503, "DATABASE_MISMATCH");
  }
}
