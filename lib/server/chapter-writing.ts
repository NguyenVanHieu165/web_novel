import "server-only";
import type { PrismaClient, Prisma } from "@/app/generated/prisma/client";
import { chapterImportSchema, writingChapterSchema, type WritingChapterInput } from "@/schemas/chapter-writing.schema";
import { z } from "zod";
import { cleanWritingText } from "@/lib/chapter-document-parser";
import { slugify, normalizeVietnameseText } from "@/lib/utils";
import { assertStudioStoryAccess, StudioAccessError, type StudioActor } from "./studio-ownership";
import { createChapterNotifications, dispatchNotification, type NotificationDispatch } from "./notifications";

export type WritingScope = "admin" | "studio";
const visible = { OR: [{ isDeleted: false }, { isDeleted: null }] };
const publicationMarkerSchema = z.object({ version: z.literal(1), publication: z.enum(["draft", "published", "trashed"]), notified: z.boolean() }).strict();
const verifiedDatabases = new WeakMap<PrismaClient, Promise<void>>();
export async function ensureWritingDatabase(db: PrismaClient) {
  let checked = verifiedDatabases.get(db);
  if (!checked) {
    checked = (async () => {
      const rows = await db.$queryRaw<Array<{ databaseName: string | null }>>`SELECT DATABASE() AS databaseName`;
      if (rows[0]?.databaseName !== "web_truyen") throw new StudioAccessError("Thao tác sáng tác chỉ được thực hiện trên database web_truyen.", 503, "WRONG_DATABASE");
    })();
    verifiedDatabases.set(db, checked);
    checked.catch(() => verifiedDatabases.delete(db));
  }
  await checked;
}

async function accessibleStory(tx: Prisma.TransactionClient, actor: StudioActor, idTruyen: number, scope: WritingScope) {
  if (scope === "studio") return assertStudioStoryAccess(tx, actor, idTruyen);
  if (!actor.roles.includes("admin")) throw new StudioAccessError("Bạn không có quyền quản trị.", 403, "FORBIDDEN");
  const story = await tx.truyen.findFirst({ where: { idTruyen, ...visible }, select: { idTruyen: true, tenTruyen: true, slug: true } });
  if (!story) throw new StudioAccessError("Không tìm thấy truyện.", 404, "STORY_NOT_FOUND");
  return story;
}

function normalized(input: WritingChapterInput) {
  const parsed = writingChapterSchema.parse(input);
  return writingChapterSchema.parse({ ...parsed, tieuDeChuong: normalizeVietnameseText(parsed.tieuDeChuong).trim(),
    slug: slugify(normalizeVietnameseText(parsed.slug)) || slugify(parsed.tieuDeChuong) || `chuong-${parsed.chuongSo}`,
    noiDung: cleanWritingText(parsed.noiDung), giaXu: parsed.isFree ? 0 : parsed.giaXu });
}
type WritingValue = ReturnType<typeof normalized>;
const detailSelect = { idChuong: true, idTruyen: true, chuongSo: true, tieuDeChuong: true, slug: true,
  isFree: true, giaXu: true, isDeleted: true, noiDungChuong: { select: { noiDung: true } } } as const;
type Detail = Prisma.ChuongGetPayload<{ select: typeof detailSelect }>;
function dto(chapter: Detail) { return { ...chapter, chuongSo: Number(chapter.chuongSo), publication: chapter.isDeleted ? "draft" as const : "published" as const }; }

async function write(tx: Prisma.TransactionClient, value: WritingValue, story: { idTruyen: number; tenTruyen: string }, notifications: NotificationDispatch[]) {
  const current = value.idChuong ? await tx.chuong.findUnique({ where: { idChuong: value.idChuong }, select: { idChuong: true, idTruyen: true, isDeleted: true } }) : null;
  if (value.idChuong && !current) throw new StudioAccessError("Không tìm thấy chương.", 404, "CHAPTER_NOT_FOUND");
  const duplicate = await tx.chuong.findFirst({ where: { idTruyen: value.idTruyen,
    OR: [{ chuongSo: value.chuongSo }, { slug: value.slug }], ...(value.idChuong ? { idChuong: { not: value.idChuong } } : {}) }, select: { idChuong: true } });
  if (duplicate) throw new StudioAccessError(`Số chương hoặc slug của chương ${value.chuongSo} đã tồn tại (kể cả chương ẩn).`, 409, "CHAPTER_CONFLICT");
  const data = { idTruyen: value.idTruyen, chuongSo: value.chuongSo, tieuDeChuong: value.tieuDeChuong,
    slug: value.slug, isFree: value.isFree, giaXu: value.giaXu, isDeleted: value.publication === "draft" };
  const content = { noiDung: value.noiDung || null, contentType: "db" as const };
  const chapter = current ? await tx.chuong.update({ where: { idChuong: current.idChuong }, data: { ...data,
    noiDungChuong: { upsert: { create: content, update: content } } }, select: detailSelect }) :
    await tx.chuong.create({ data: { ...data, noiDungChuong: { create: content } }, select: detailSelect });
  const key = `studio.chapter.${chapter.idChuong}`;
  const marker = current ? await tx.caiDatHeThong.findUnique({ where: { khoa: key }, select: { giaTri: true } }) : null;
  let notified = current ? !current.isDeleted : false;
  if (marker) {
    try { notified = publicationMarkerSchema.parse(JSON.parse(marker.giaTri)).notified; }
    catch { throw new StudioAccessError("Trạng thái xuất bản không hợp lệ. Vui lòng liên hệ quản trị.", 409, "PUBLICATION_INVALID"); }
  }
  if (value.publication === "published" && !notified) {
    notifications.push(await createChapterNotifications(tx, story, chapter));
    notified = true;
  }
  await tx.caiDatHeThong.upsert({ where: { khoa: key }, create: { khoa: key, giaTri: JSON.stringify({ version: 1, publication: value.publication, notified }), moTa: "Trạng thái chương sáng tác" },
    update: { giaTri: JSON.stringify({ version: 1, publication: value.publication, notified }) } });
  return { chapter: dto(chapter), oldStoryId: current?.idTruyen };
}
async function updateCounts(tx: Prisma.TransactionClient, ids: number[]) {
  for (const idTruyen of new Set(ids)) {
    const soChuong = await tx.chuong.count({ where: { idTruyen, ...visible } });
    await tx.truyen.update({ where: { idTruyen }, data: { soChuong } });
  }
}
async function transaction<T>(db: PrismaClient, operation: (tx: Prisma.TransactionClient, notifications: NotificationDispatch[]) => Promise<T>): Promise<T> {
  await ensureWritingDatabase(db);
  for (let attempt = 0; ; attempt++) {
    const notifications: NotificationDispatch[] = [];
    try {
      const result = await db.$transaction((tx) => operation(tx, notifications), { isolationLevel: "Serializable", timeout: 60_000 });
      for (const notification of notifications) await dispatchNotification(notification);
      return result;
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      if (code === "P2034" && attempt < 2) continue;
      if (code === "P2002") throw new StudioAccessError("Số chương hoặc slug đã tồn tại. Hãy cập nhật số chương rồi thử lại.", 409, "CHAPTER_CONFLICT");
      throw error;
    }
  }
}

export async function saveWritingChapter(db: PrismaClient, actor: StudioActor, input: WritingChapterInput, scope: WritingScope) {
  const value = normalized(input);
  return transaction(db, async (tx, notifications) => {
    const current = value.idChuong ? await tx.chuong.findUnique({ where: { idChuong: value.idChuong }, select: { idTruyen: true } }) : null;
    const ids = [...new Set([value.idTruyen, ...(current ? [current.idTruyen] : [])])].sort((a, b) => a - b);
    for (const id of ids) { await accessibleStory(tx, actor, id, scope); await tx.$queryRaw`SELECT idTRUYEN FROM truyen WHERE idTRUYEN = ${id} FOR UPDATE`; }
    if (scope === "studio" && current && current.idTruyen !== value.idTruyen) throw new StudioAccessError("Không được chuyển chương sang truyện khác.", 403, "FORBIDDEN");
    if (scope === "studio" && value.idChuong) {
      const chapter = await tx.chuong.findUnique({ where: { idChuong: value.idChuong }, select: { isDeleted: true } });
      if (chapter?.isDeleted) {
        const marker = await tx.caiDatHeThong.findUnique({ where: { khoa: `studio.chapter.${value.idChuong}` }, select: { giaTri: true } });
        let isDraft = false;
        try { isDraft = publicationMarkerSchema.parse(JSON.parse(marker?.giaTri ?? "null")).publication === "draft"; } catch { /* Missing or corrupt markers cannot restore trashed chapters. */ }
        if (!isDraft) throw new StudioAccessError("Không thể biên tập chương đã chuyển vào thùng rác.", 403, "CHAPTER_TRASHED");
      }
    }
    const story = await accessibleStory(tx, actor, value.idTruyen, scope);
    const result = await write(tx, value, story, notifications);
    await updateCounts(tx, ids);
    return result.chapter;
  });
}

export async function importWritingChapters(db: PrismaClient, actor: StudioActor, input: unknown, scope: WritingScope) {
  const parsed = chapterImportSchema.parse(input);
  const values = parsed.chapters.map((chapter) => normalized({ ...chapter, idTruyen: parsed.idTruyen }));
  if (new Set(values.map((chapter) => chapter.chuongSo)).size !== values.length || new Set(values.map((chapter) => chapter.slug)).size !== values.length)
    throw new StudioAccessError("Danh sách import có số chương hoặc slug trùng nhau.", 409, "CHAPTER_CONFLICT");
  return transaction(db, async (tx, notifications) => {
    const story = await accessibleStory(tx, actor, parsed.idTruyen, scope);
    await tx.$queryRaw`SELECT idTRUYEN FROM truyen WHERE idTRUYEN = ${parsed.idTruyen} FOR UPDATE`;
    const chapters = [];
    for (const value of values) chapters.push((await write(tx, value, story, notifications)).chapter);
    await updateCounts(tx, [parsed.idTruyen]);
    const aggregate = await tx.chuong.aggregate({ where: { idTruyen: parsed.idTruyen }, _max: { chuongSo: true } });
    return { chapters, imported: chapters.length, nextNumber: Math.round((Number(aggregate._max.chuongSo ?? 0) + 1) * 10) / 10 };
  });
}

export async function nextWritingChapterNumber(db: PrismaClient, actor: StudioActor, storyId: number, scope: WritingScope) {
  await ensureWritingDatabase(db);
  await accessibleStory(db, actor, storyId, scope);
  const aggregate = await db.chuong.aggregate({ where: { idTruyen: storyId }, _max: { chuongSo: true } });
  return Math.round((Number(aggregate._max.chuongSo ?? 0) + 1) * 10) / 10;
}
