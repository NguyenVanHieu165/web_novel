import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "../../app/generated/prisma/client";
import { metadataKey, normalized } from "./normalizer";
import { ImportSourceError } from "./types";
import type { ChapterRef, ScrapedStory } from "./types";

export async function ensureImportDatabase(db: PrismaClient) {
  if (process.env.DATABASE_NAME !== "web_truyen") throw new ImportSourceError("Import chỉ được phép ghi database web_truyen.");
  const rows = await db.$queryRaw<Array<{ db: string }>>`SELECT DATABASE() AS db`;
  if (rows[0]?.db !== "web_truyen") throw new ImportSourceError("Kết nối thực tế không phải web_truyen.");
}
export const sourceTag = (url: string) => `import-url:${createHash("sha256").update(url).digest("hex")}`;
/** Resume inventory returns only chapter numbers, never all long chapter bodies. */
export async function existingImportChapterNumbers(db: PrismaClient, idTruyen: number) {
  const rows = await db.$queryRaw<Array<{ chuongSo: string | number }>>`
    SELECT c.chuong_so AS chuongSo FROM chuong c
    JOIN noi_dung_chuong n ON n.idCHUONG = c.idCHUONG
    WHERE c.idTRUYEN = ${idTruyen} AND n.noi_dung REGEXP '[^[:space:]]'
  `;
  return new Set(rows.map(row => Number(row.chuongSo)));
}
export async function findImportStory(db: PrismaClient, story: ScrapedStory, url: string): Promise<{ idTruyen: number; slug: string; anhBia: string; isDeleted: boolean | null } | null> {
  const exact = await db.truyen.findFirst({ where: { OR: [{ tag: sourceTag(url) }, { slug: story.slug }] }, select: { idTruyen: true, slug: true, isDeleted: true, anhBia: true, tenTruyen: true, tag: true } });
  const titleKey = metadataKey(normalized(story.title).slice(0, 255));
  if (exact?.isDeleted) throw new ImportSourceError("Truyện đã bị xóa; không tự khôi phục qua import.");
  if (exact && exact.tag !== sourceTag(url) && metadataKey(exact.tenTruyen) !== titleKey) throw new ImportSourceError("Slug trùng với một truyện khác tên; hãy kiểm tra thủ công.");
  if (exact) return exact;
  const candidates = await db.truyen.findMany({ select: { idTruyen: true, slug: true, tenTruyen: true, isDeleted: true, anhBia: true } });
  const matching = candidates.filter(row => metadataKey(row.tenTruyen) === titleKey);
  if (matching.length > 1) throw new ImportSourceError("Có nhiều truyện trùng tên; hãy kiểm tra thủ công.");
  if (matching[0]?.isDeleted) throw new ImportSourceError("Truyện đã bị xóa.");
  return matching[0] ?? null;
}
export async function createImportStory(db: PrismaClient, story: ScrapedStory, url: string, cover: string) {
  return db.$transaction(tx => createStoryMetadata(tx, story, url, cover), { timeout: 20000, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

/** A first-body failure rolls back the new story, metadata and every join together. */
export async function createImportStoryWithChapter(db: PrismaClient, story: ScrapedStory, url: string, cover: string, ref: ChapterRef, content: string) {
  return db.$transaction(async tx => {
    const row = await createStoryMetadata(tx, story, url, cover);
    await storeChapterInTransaction(tx, row.idTruyen, ref, content, true);
    await tx.truyen.update({ where: { idTruyen: row.idTruyen }, data: { soChuong: 1 } });
    return row;
  }, { timeout: 20000, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

async function createStoryMetadata(tx: Prisma.TransactionClient, story: ScrapedStory, url: string, cover: string) {
    // Lock both metadata inventories/ranges while checking normalized names.
    // Cooperating import jobs are also serialized by the process job manager.
    await tx.$queryRaw`SELECT idTHE_LOAI FROM the_loai FOR UPDATE`;
    await tx.$queryRaw`SELECT idTAC_GIA_DICH FROM tac_gia_dich FOR UPDATE`;
    const genres = await tx.theLoai.findMany({ select: { idTheLoai: true, tenTheLoai: true } });
    const authors = await tx.tacGiaDich.findMany({ select: { idTacGiaDich: true, ten: true } });
    const genreMap = new Map(genres.map(g => [metadataKey(g.tenTheLoai), g.idTheLoai]));
    const authorMap = new Map(authors.map(a => [metadataKey(a.ten), a.idTacGiaDich]));
    const row = await tx.truyen.create({ data: { tenTruyen: normalized(story.title).slice(0, 255), slug: story.slug.slice(0, 220), moTa: story.description,
      anhBia: cover, anhThumbnail: cover || null, tag: sourceTag(url), trang_thai: story.completed ? "hoan_thanh" : "dang_tien_hanh", luotXem: Math.min(4294967295, Math.max(0, Math.floor(story.views))) }, select: { idTruyen: true, slug: true, anhBia: true, isDeleted: true } });
    for (const name of new Set(story.genres.map(name => normalized(name).slice(0, 100)).filter(Boolean))) {
      const key = metadataKey(name); let id = genreMap.get(key);
      if (!id) { id = (await tx.theLoai.create({ data: { tenTheLoai: name }, select: { idTheLoai: true } })).idTheLoai; genreMap.set(key, id); }
      await tx.truyenTheLoai.upsert({ where: { idTruyen_idTheLoai: { idTruyen: row.idTruyen, idTheLoai: id } }, create: { idTruyen: row.idTruyen, idTheLoai: id }, update: {} });
    }
    const used = new Set<number>();
    for (const name of new Set(story.authors.map(name => normalized(name).slice(0, 200)).filter(Boolean))) {
      const key = metadataKey(name); let id = authorMap.get(key);
      if (!id) { id = (await tx.tacGiaDich.create({ data: { ten: name, loai: "tac_gia" }, select: { idTacGiaDich: true } })).idTacGiaDich; authorMap.set(key, id); }
      if (!used.has(id)) { await tx.truyen_tac_gia_dich.create({ data: { idTRUYEN: row.idTruyen, idTAC_GIA_DICH: id, vai_tro: "tac_gia_chinh" } }); used.add(id); }
    }
    return row;
}
export async function storeImportChapter(db: PrismaClient, idTruyen: number, ref: ChapterRef, content: string, skipExisting: boolean) {
  return db.$transaction(tx => storeChapterInTransaction(tx, idTruyen, ref, content, skipExisting));
}

async function storeChapterInTransaction(tx: Prisma.TransactionClient, idTruyen: number, ref: ChapterRef, content: string, skipExisting: boolean) {
    const body = content.trim();
    if (!body) throw new ImportSourceError("Nội dung chương rỗng; không ghi vào database.");
    const old = await tx.chuong.findUnique({ where: { idTruyen_chuongSo: { idTruyen, chuongSo: ref.number } }, select: { idChuong: true, isDeleted: true, noiDungChuong: { select: { noiDung: true } } } });
    if (old?.isDeleted) throw new ImportSourceError("Không khôi phục chương đã xóa.");
    if (old?.noiDungChuong?.noiDung?.trim() && skipExisting) return false;
    const slug = `chuong-${ref.number}`;
    const other = await tx.chuong.findUnique({ where: { idTruyen_slug: { idTruyen, slug } }, select: { idChuong: true } });
    if (other && other.idChuong !== old?.idChuong) throw new ImportSourceError("Slug chương xung đột với số chương khác.");
    const row = old ?? await tx.chuong.create({ data: { idTruyen, chuongSo: ref.number, slug, tieuDeChuong: normalized(ref.title).slice(0, 300), isFree: true, giaXu: 0 }, select: { idChuong: true } });
    await tx.noiDungChuong.upsert({ where: { idChuong: row.idChuong }, create: { idChuong: row.idChuong, noiDung: body, contentType: "db" }, update: { noiDung: body, contentType: "db" } });
    // Refresh title when overwriting, preserving existing paywall/prices and IDs.
    if (old) await tx.chuong.update({ where: { idChuong: old.idChuong }, data: { tieuDeChuong: normalized(ref.title).slice(0, 300) } });
    return true;
}
