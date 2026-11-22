import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@/app/generated/prisma/client";
import { normalizeVietnameseText, slugify } from "@/lib/utils";
import type { StudioStoryInput, StudioStoryUpdate } from "@/schemas/studio.schema";
import {
  accountAuthorKey, accountAuthorSchema, assertStudioStoryAccess, ensureStudioDatabase,
  storyOwnershipKey, StudioAccessError, type StudioActor,
} from "@/lib/server/studio-ownership";

const storySelect = {
  idTruyen: true, tenTruyen: true, slug: true, anhBia: true, moTa: true,
  trang_thai: true, soChuong: true, luotXem: true,
} satisfies Prisma.TruyenSelect;
const active = { OR: [{ isDeleted: false }, { isDeleted: null }] };

// The registry has a primary key; account-row locking serializes its creation.
async function studioAuthor(tx: Prisma.TransactionClient, actor: StudioActor) {
  const account = await tx.$queryRaw<Array<{ idTaiKhoan: number }>>`
    SELECT idTAI_KHOAN AS idTaiKhoan FROM tai_khoan
    WHERE idTAI_KHOAN = ${actor.idTaiKhoan} AND trang_thai = 'active'
      AND (is_deleted = FALSE OR is_deleted IS NULL) FOR UPDATE`;
  if (!account.length) throw new StudioAccessError("Tài khoản không còn hoạt động.", 401, "UNAUTHENTICATED");
  const existing = await tx.caiDatHeThong.findUnique({ where: { khoa: accountAuthorKey(actor.idTaiKhoan) }, select: { giaTri: true } });
  if (existing) {
    let raw: unknown;
    try { raw = JSON.parse(existing.giaTri); } catch { raw = null; }
    const parsed = accountAuthorSchema.safeParse(raw);
    if (!parsed.success) throw new StudioAccessError("Liên kết tác giả không hợp lệ. Vui lòng liên hệ quản trị viên.", 409, "AUTHOR_LINK_INVALID");
    const author = await tx.tacGiaDich.findFirst({ where: { idTacGiaDich: parsed.data.authorId, loai: { in: ["tac_gia", "both"] } }, select: { idTacGiaDich: true } });
    if (!author) throw new StudioAccessError("Không tìm thấy hồ sơ tác giả đã liên kết.", 409, "AUTHOR_LINK_INVALID");
    return author.idTacGiaDich;
  }
  const accountInfo = await tx.taiKhoan.findUnique({ where: { idTaiKhoan: actor.idTaiKhoan }, select: { tenTaiKhoan: true, hoSoCaNhan: { select: { ho_ten: true } } } });
  const author = await tx.tacGiaDich.create({ data: {
    ten: normalizeVietnameseText(accountInfo?.hoSoCaNhan?.ho_ten || accountInfo?.tenTaiKhoan || `Tác giả ${actor.idTaiKhoan}`).trim().slice(0, 200), loai: "tac_gia",
  }, select: { idTacGiaDich: true } });
  await tx.caiDatHeThong.create({ data: {
    khoa: accountAuthorKey(actor.idTaiKhoan), giaTri: JSON.stringify({ version: 1, authorId: author.idTacGiaDich }), moTa: "Liên kết tác giả Studio do server quản lý",
  } });
  return author.idTacGiaDich;
}

/** Shared, parameterized ownership predicate for paginated metadata/statistics. */
function ownedBy(accountId: number) {
  const payload = Prisma.sql`CASE WHEN JSON_VALID(s.gia_tri) THEN s.gia_tri ELSE '{}' END`;
  return Prisma.sql`
    s.khoa = CONCAT('studio.story.', t.idTRUYEN)
    AND JSON_TYPE(${payload}) = 'OBJECT' AND JSON_LENGTH(${payload}) = 3
    AND JSON_TYPE(JSON_EXTRACT(${payload}, '$.version')) = 'INTEGER'
    AND JSON_TYPE(JSON_EXTRACT(${payload}, '$.ownerId')) = 'INTEGER'
    AND JSON_TYPE(JSON_EXTRACT(${payload}, '$.authorId')) = 'INTEGER'
    AND CAST(JSON_UNQUOTE(JSON_EXTRACT(${payload}, '$.version')) AS UNSIGNED) = 1
    AND CAST(JSON_UNQUOTE(JSON_EXTRACT(${payload}, '$.ownerId')) AS UNSIGNED) = ${accountId}
    AND t.nguon = 'sang_tac' AND (t.is_deleted = FALSE OR t.is_deleted IS NULL)
    AND EXISTS (SELECT 1 FROM tai_khoan a WHERE a.idTAI_KHOAN = ${accountId}
      AND a.trang_thai = 'active' AND (a.is_deleted = FALSE OR a.is_deleted IS NULL))
    AND EXISTS (SELECT 1 FROM truyen_tac_gia_dich rel JOIN tac_gia_dich author ON author.idTAC_GIA_DICH = rel.idTAC_GIA_DICH
      WHERE rel.idTRUYEN = t.idTRUYEN AND rel.vai_tro = 'tac_gia_chinh' AND author.loai IN ('tac_gia', 'both')
      AND rel.idTAC_GIA_DICH = CAST(JSON_UNQUOTE(JSON_EXTRACT(${payload}, '$.authorId')) AS UNSIGNED))`;
}

export async function listStudioStories(db: PrismaClient, actor: StudioActor, page = 1, pageSize = 20) {
  await ensureStudioDatabase(db);
  const ownership = ownedBy(actor.idTaiKhoan);
  const [ids, totals, chapters, revenue] = await Promise.all([
    db.$queryRaw<Array<{ idTruyen: number }>>(Prisma.sql`SELECT t.idTRUYEN AS idTruyen FROM truyen t JOIN cai_dat_he_thong s ON s.khoa = CONCAT('studio.story.', t.idTRUYEN)
      WHERE ${ownership} ORDER BY t.idTRUYEN DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
    db.$queryRaw<Array<{ stories: bigint | number; views: bigint | number | null }>>(Prisma.sql`SELECT COUNT(*) AS stories, COALESCE(SUM(t.luot_xem), 0) AS views
      FROM truyen t JOIN cai_dat_he_thong s ON s.khoa = CONCAT('studio.story.', t.idTRUYEN) WHERE ${ownership}`),
    db.$queryRaw<Array<{ publishedChapters: bigint | number }>>(Prisma.sql`SELECT COUNT(*) AS publishedChapters FROM chuong c JOIN truyen t ON t.idTRUYEN = c.idTRUYEN
      JOIN cai_dat_he_thong s ON s.khoa = CONCAT('studio.story.', t.idTRUYEN) WHERE ${ownership} AND (c.is_deleted = FALSE OR c.is_deleted IS NULL)`),
    // Positive mua_chuong rows are author credits; negative rows are purchases.
    db.lichSuGiaoDich.aggregate({ where: { idTaiKhoan: actor.idTaiKhoan, loai: "mua_chuong", so_xu_thay_doi: { gt: 0 } }, _sum: { so_xu_thay_doi: true } }),
  ]);
  const stories = ids.length ? await db.truyen.findMany({ where: { idTruyen: { in: ids.map((row) => Number(row.idTruyen)) }, ...active }, select: storySelect, orderBy: { idTruyen: "desc" } }) : [];
  const total = Number(totals[0]?.stories ?? 0);
  return { stories, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    stats: { stories: total, publishedChapters: Number(chapters[0]?.publishedChapters ?? 0), views: Number(totals[0]?.views ?? 0), revenue: revenue._sum.so_xu_thay_doi ?? 0 } };
}

export async function createStudioStory(db: PrismaClient, actor: StudioActor, input: StudioStoryInput) {
  return db.$transaction(async (tx) => {
    await ensureStudioDatabase(tx);
    const authorId = await studioAuthor(tx, actor);
    const story = await tx.truyen.create({ data: {
      tenTruyen: normalizeVietnameseText(input.tenTruyen).trim(), slug: `${slugify(input.tenTruyen).slice(0, 240) || "truyen"}-${randomUUID().slice(0, 8)}`,
      anhBia: input.anhBia, moTa: normalizeVietnameseText(input.moTa), trang_thai: input.trang_thai,
      nguon: "sang_tac", isDeleted: false,
      truyen_tac_gia_dich: { create: { idTAC_GIA_DICH: authorId, vai_tro: "tac_gia_chinh" } },
    }, select: storySelect });
    await tx.caiDatHeThong.create({ data: {
      khoa: storyOwnershipKey(story.idTruyen), giaTri: JSON.stringify({ version: 1, ownerId: actor.idTaiKhoan, authorId }), moTa: "Quyền sở hữu truyện Studio do server quản lý",
    } });
    return story;
  }, { isolationLevel: "Serializable", timeout: 15000 });
}

export async function updateStudioStory(db: PrismaClient, actor: StudioActor, storyId: number, input: StudioStoryUpdate) {
  return db.$transaction(async (tx) => {
    await ensureStudioDatabase(tx);
    await assertStudioStoryAccess(tx, actor, storyId);
    return tx.truyen.update({ where: { idTruyen: storyId }, data: input, select: storySelect });
  }, { isolationLevel: "Serializable" });
}

export async function deleteStudioStory(db: PrismaClient, actor: StudioActor, storyId: number) {
  return db.$transaction(async (tx) => {
    await ensureStudioDatabase(tx);
    await assertStudioStoryAccess(tx, actor, storyId);
    // Keep purchases, wallet history and reader replies intact.
    await tx.truyen.update({ where: { idTruyen: storyId }, data: { isDeleted: true } });
    return { idTruyen: storyId };
  }, { isolationLevel: "Serializable" });
}

export async function listStudioChapters(db: PrismaClient, actor: StudioActor, storyId: number, page = 1, pageSize = 20) {
  await ensureStudioDatabase(db);
  const story = await assertStudioStoryAccess(db, actor, storyId);
  const visible = Prisma.sql`(c.is_deleted = FALSE OR c.is_deleted IS NULL OR EXISTS (
    SELECT 1 FROM cai_dat_he_thong draft WHERE draft.khoa = CONCAT('studio.chapter.', c.idCHUONG)
      AND JSON_UNQUOTE(JSON_EXTRACT(CASE WHEN JSON_VALID(draft.gia_tri) THEN draft.gia_tri ELSE '{}' END, '$.publication')) = 'draft'
      AND JSON_EXTRACT(CASE WHEN JSON_VALID(draft.gia_tri) THEN draft.gia_tri ELSE '{}' END, '$.version') = 1))`;
  const [ids, counted, maximum] = await Promise.all([
    db.$queryRaw<Array<{ idChuong: number }>>(Prisma.sql`SELECT c.idCHUONG AS idChuong FROM chuong c WHERE c.idTRUYEN = ${storyId} AND ${visible}
      ORDER BY c.chuong_so DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
    db.$queryRaw<Array<{ total: number | bigint }>>(Prisma.sql`SELECT COUNT(*) AS total FROM chuong c WHERE c.idTRUYEN = ${storyId} AND ${visible}`),
    db.chuong.aggregate({ where: { idTruyen: storyId }, _max: { chuongSo: true } }),
  ]);
  const chapters = ids.length ? await db.chuong.findMany({ where: { idTruyen: storyId, idChuong: { in: ids.map((row) => Number(row.idChuong)) } },
    select: { idChuong: true, chuongSo: true, tieuDeChuong: true, slug: true, isFree: true, giaXu: true, isDeleted: true }, orderBy: { chuongSo: "desc" }, take: pageSize }) : [];
  const total = Number(counted[0]?.total ?? 0);
  return { story, chapters: chapters.map((chapter) => ({ ...chapter, chuongSo: Number(chapter.chuongSo) })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }, nextNumber: Number(maximum._max.chuongSo ?? 0) + 1 };
}

export async function getStudioChapter(db: PrismaClient, actor: StudioActor, storyId: number, chapterId: number) {
  await ensureStudioDatabase(db);
  const story = await assertStudioStoryAccess(db, actor, storyId);
  const chapter = await db.chuong.findFirst({ where: { idTruyen: storyId, idChuong: chapterId }, select: {
    idChuong: true, idTruyen: true, chuongSo: true, tieuDeChuong: true, slug: true, isFree: true, giaXu: true, isDeleted: true,
    noiDungChuong: { select: { noiDung: true } },
  } });
  if (!chapter) throw new StudioAccessError("Không tìm thấy chương.", 404, "CHAPTER_NOT_FOUND");
  if (chapter.isDeleted) {
    const draft = await db.caiDatHeThong.findUnique({ where: { khoa: `studio.chapter.${chapterId}` }, select: { giaTri: true } });
    let metadata: unknown;
    try { metadata = JSON.parse(draft?.giaTri ?? "null"); } catch { metadata = null; }
    if (typeof metadata !== "object" || metadata === null || !("publication" in metadata) || metadata.publication !== "draft" || !("version" in metadata) || metadata.version !== 1) {
      throw new StudioAccessError("Không tìm thấy chương.", 404, "CHAPTER_NOT_FOUND");
    }
  }
  return { story, chapter: { ...chapter, chuongSo: Number(chapter.chuongSo), publication: chapter.isDeleted ? "draft" : "published" } };
}
