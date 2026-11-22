import "server-only";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeVietnameseText } from "@/lib/vietnamese-text";
import { parseChapterNumberSearch, type AdminChaptersQuery, type ChapterBulkInput } from "@/schemas/admin-chapters.schema";

export const liveChapterWhere = { OR: [{ isDeleted: false }, { isDeleted: null }] };
export function chapterText(value: string | null | undefined) {
  return normalizeVietnameseText(value ?? "").replace(/\r\n?/g, "\n");
}
export function countChapterWords(value: string) {
  const text = value.replace(/[\s\u200b]+/gu, " ").trim();
  return text ? text.split(" ").length : 0;
}

// Count whitespace-delimited words in SQL, keeping full content out of list responses.
// Both MySQL 8 and MariaDB support REGEXP_REPLACE. NFC does not change word boundaries.
const normalized = Prisma.sql`TRIM(REGEXP_REPLACE(COALESCE(n.noi_dung, ''), ${"[[:space:]\u00a0\u2000-\u200b\u2028\u2029\u202f\u205f\u3000\ufeff]+"}, ' '))`;
function wordCountExpression(value: Prisma.Sql) {
  return Prisma.sql`CASE WHEN ${value} = '' THEN 0 ELSE CHAR_LENGTH(${value}) - CHAR_LENGTH(REPLACE(${value}, ' ', '')) + 1 END`;
}

export async function listAdminChapters(query: AdminChaptersQuery) {
  const published = Prisma.sql`(c.is_deleted = false OR c.is_deleted IS NULL)`;
  const draft = Prisma.sql`(c.is_deleted = true AND EXISTS (SELECT 1 FROM cai_dat_he_thong settings
    WHERE settings.khoa = CONCAT('studio.chapter.', c.idCHUONG)
      AND JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(settings.gia_tri), settings.gia_tri, '{}'), '$.publication')) = 'draft'
      AND JSON_EXTRACT(IF(JSON_VALID(settings.gia_tri), settings.gia_tri, '{}'), '$.version') = 1))`;
  const publication = query.publicationFilter === "draft" ? draft : query.publicationFilter === "all" ? Prisma.sql`(${published} OR ${draft})` : published;
  const conditions = [publication, Prisma.sql`(t.is_deleted = false OR t.is_deleted IS NULL)`];
  if (query.storyId) conditions.push(Prisma.sql`c.idTRUYEN = ${query.storyId}`);
  if (query.vipFilter === "free") conditions.push(Prisma.sql`COALESCE(c.gia_xu, 0) = 0`);
  if (query.vipFilter === "vip") conditions.push(Prisma.sql`c.gia_xu > 0`);
  const range = parseChapterNumberSearch(query.q);
  if (range) conditions.push(Prisma.sql`c.chuong_so BETWEEN ${range.from} AND ${range.to}`);
  else if (query.q) {
    const term = `%${query.q.replace(/[!%_]/g, "!$&")}%`;
    conditions.push(Prisma.sql`(c.tieu_de_chuong LIKE ${term} ESCAPE '!' OR c.slug LIKE ${term} ESCAPE '!' OR t.ten_truyen LIKE ${term} ESCAPE '!')`);
  }
  const baseFrom = Prisma.sql`FROM chuong c JOIN truyen t ON t.idTRUYEN = c.idTRUYEN`;
  const where = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
  const needsAllCounts = query.shortOnly === "true" || query.sortBy === "wordCount";
  // LIMIT prevents MySQL/MariaDB from merging the derived table and evaluating
  // REGEXP_REPLACE repeatedly. Normalize each matching chapter only once.
  const countedFrom = Prisma.sql`FROM (
    SELECT c.idCHUONG, c.chuong_so, c.tieu_de_chuong, c.gia_xu, c.created_at,
      t.ten_truyen, ${normalized} AS normalized_text
    ${baseFrom} LEFT JOIN noi_dung_chuong n ON n.idCHUONG = c.idCHUONG ${where}
    LIMIT 18446744073709551615
  ) c`;
  const countedWords = wordCountExpression(Prisma.sql`c.normalized_text`);
  const shortWhere = query.shortOnly === "true" ? Prisma.sql`WHERE ${countedWords} < 100` : Prisma.empty;
  const columns = {
    id: Prisma.sql`c.idCHUONG`, truyen: needsAllCounts ? Prisma.sql`c.ten_truyen` : Prisma.sql`t.ten_truyen`,
    soChuong: Prisma.sql`c.chuong_so`, tieuDe: Prisma.sql`c.tieu_de_chuong`,
    giaXu: Prisma.sql`COALESCE(c.gia_xu, 0)`, wordCount: countedWords, ngayTao: Prisma.sql`c.created_at`,
  };
  const direction = query.sortOrder === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  return prisma.$transaction(async (tx) => {
    type CountedRow = { idChuong: number; wordCount: bigint | number; total: bigint };
    let rows: { idChuong: number; wordCount?: bigint | number }[];
    let total: number;
    if (needsAllCounts) {
      // Window count shares the expensive pass with pagination; count only again
      // when an out-of-range page has no row carrying its total.
      const counted = await tx.$queryRaw<CountedRow[]>(Prisma.sql`SELECT c.idCHUONG AS idChuong, ${countedWords} AS wordCount, COUNT(*) OVER() AS total
        ${countedFrom} ${shortWhere} ORDER BY ${columns[query.sortBy]} ${direction}, c.idCHUONG ${direction}
        LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`);
      rows = counted;
      total = counted.length ? Number(counted[0].total) : Number((await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS total ${countedFrom} ${shortWhere}`))[0].total);
    } else {
      // Ordinary pages select IDs and count rows without joining chapter content.
      rows = await tx.$queryRaw<{ idChuong: number }[]>(Prisma.sql`SELECT c.idCHUONG AS idChuong ${baseFrom} ${where}
        ORDER BY ${columns[query.sortBy]} ${direction}, c.idCHUONG ${direction} LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`);
      total = Number((await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS total ${baseFrom} ${where}`))[0].total);
      if (rows.length) {
        const counts = await tx.$queryRaw<{ idChuong: number; wordCount: bigint | number }[]>(Prisma.sql`SELECT n.idCHUONG AS idChuong, ${wordCountExpression(normalized)} AS wordCount
          FROM noi_dung_chuong n WHERE n.idCHUONG IN (${Prisma.join(rows.map((row) => row.idChuong))})`);
        const byId = new Map(counts.map((row) => [row.idChuong, row.wordCount]));
        rows = rows.map((row) => ({ ...row, wordCount: byId.get(row.idChuong) ?? 0 }));
      }
    }
    const chapters = rows.length ? await tx.chuong.findMany({
      where: { idChuong: { in: rows.map((row) => row.idChuong) } },
      select: { idChuong: true, idTruyen: true, chuongSo: true, tieuDeChuong: true, slug: true, isFree: true, giaXu: true, isDeleted: true, createdAt: true, truyen: { select: { idTruyen: true, tenTruyen: true } } },
    }) : [];
    const byId = new Map(chapters.map((chapter) => [chapter.idChuong, chapter]));
    return { data: rows.map((row) => ({ ...byId.get(row.idChuong)!, wordCount: Number(row.wordCount ?? 0) })), meta: { page: query.page, limit: query.limit, total, totalPage: Math.max(1, Math.ceil(total / query.limit)) } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
}

export class ChapterMutationError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function mutateChapters(input: ChapterBulkInput) {
  return prisma.$transaction(async (tx) => {
    const chapters = await tx.$queryRaw<{ idChuong: number; idTruyen: number }[]>(Prisma.sql`SELECT idCHUONG AS idChuong, idTRUYEN AS idTruyen FROM chuong
      WHERE idCHUONG IN (${Prisma.join(input.chapterIds)}) AND (is_deleted = false OR is_deleted IS NULL OR EXISTS (
        SELECT 1 FROM cai_dat_he_thong settings WHERE settings.khoa = CONCAT('studio.chapter.', chuong.idCHUONG)
          AND JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(settings.gia_tri), settings.gia_tri, '{}'), '$.publication')) = 'draft'
          AND JSON_EXTRACT(IF(JSON_VALID(settings.gia_tri), settings.gia_tri, '{}'), '$.version') = 1)) ORDER BY idCHUONG FOR UPDATE`);
    if (chapters.length !== input.chapterIds.length) throw new ChapterMutationError("Có chương không tồn tại hoặc đã xóa. Hãy tải lại danh sách.", 404);
    const where = { idChuong: { in: input.chapterIds } };
    if (input.action !== "delete") {
      return tx.chuong.updateMany({ where, data: { isFree: input.action === "set-free", giaXu: input.action === "set-free" ? 0 : input.giaXu } });
    }
    const chapterRelation = { idChuong: { in: input.chapterIds } };
    await tx.likeBinhLuan.deleteMany({ where: { binhLuan: chapterRelation } });
    await tx.binhLuan.deleteMany({ where: chapterRelation });
    await tx.tienDoDoc.deleteMany({ where: chapterRelation });
    await tx.lichSuDoc.deleteMany({ where: chapterRelation });
    await tx.chuongDaMua.deleteMany({ where: chapterRelation });
    await tx.noiDungChuong.deleteMany({ where: chapterRelation });
    await tx.caiDatHeThong.deleteMany({ where: { khoa: { in: input.chapterIds.map((id) => `studio.chapter.${id}`) } } });
    const deleted = await tx.chuong.deleteMany({ where });
    for (const idTruyen of [...new Set(chapters.map((chapter) => chapter.idTruyen))].sort((a, b) => a - b)) {
      const soChuong = await tx.chuong.count({ where: { idTruyen, ...liveChapterWhere } });
      await tx.truyen.update({ where: { idTruyen }, data: { soChuong } });
    }
    return deleted;
  });
}
