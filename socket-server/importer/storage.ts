import { createHash } from "node:crypto";
import type { Pool, PoolConnection, UpsertResult } from "mariadb";
import { metadataKey, normalized } from "./normalizer";
import { ImportSourceError, type ChapterRef, type ScrapedStory } from "./types";
import type { ImportStorage, StoredImportStory } from "./executor";

type QueryClient = Pick<Pool, "query">;
type StoryRow = {
  idTruyen: number;
  slug: string;
  anhBia: string;
  isDeleted: boolean | number | null;
  tenTruyen: string;
  tag: string | null;
};
type ChapterRow = {
  idChuong: number;
  isDeleted: boolean | number | null;
  noiDung: string | null;
};
type GenreRow = { idTheLoai: number; tenTheLoai: string };
type AuthorRow = { idTacGiaDich: number; ten: string };

const sourceTag = (url: string) => `import-url:${createHash("sha256").update(url).digest("hex")}`;

function storedStory(row: StoryRow): StoredImportStory {
  return {
    idTruyen: Number(row.idTruyen),
    slug: row.slug,
    anhBia: row.anhBia,
    isDeleted: row.isDeleted == null ? null : Boolean(row.isDeleted),
  };
}

function insertedId(result: UpsertResult) {
  const id = Number(result.insertId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ImportSourceError("Database không trả mã bản ghi vừa tạo.");
  return id;
}

async function exactStory(client: QueryClient, story: ScrapedStory, sourceUrl: string, forUpdate = false) {
  const tag = sourceTag(sourceUrl);
  const rows = await client.query<StoryRow[]>(`
    SELECT idTRUYEN AS idTruyen, slug, anh_bia AS anhBia, is_deleted AS isDeleted,
           ten_truyen AS tenTruyen, tag
    FROM truyen
    WHERE tag = ? OR slug = ?
    ORDER BY CASE WHEN tag = ? THEN 0 ELSE 1 END, idTRUYEN ASC
    LIMIT 3${forUpdate ? " FOR UPDATE" : ""}
  `, [tag, story.slug, tag]);
  const tagged = rows.find((row) => row.tag === tag);
  const slugged = rows.find((row) => row.slug === story.slug);
  if (tagged && slugged && tagged.idTruyen !== slugged.idTruyen) {
    throw new ImportSourceError("Nguồn và slug đang trỏ tới hai truyện khác nhau; hãy kiểm tra thủ công.");
  }
  const row = tagged ?? slugged;
  if (!row) return null;
  if (row.isDeleted) throw new ImportSourceError("Truyện đã bị xóa; không tự khôi phục qua import.");
  if (row.tag !== tag && metadataKey(row.tenTruyen) !== metadataKey(normalized(story.title).slice(0, 255))) {
    throw new ImportSourceError("Slug trùng với một truyện khác tên; hãy kiểm tra thủ công.");
  }
  return row;
}

async function inTransaction<T>(pool: Pool, work: (connection: PoolConnection) => Promise<T>) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("[import-transaction-rollback-failed]", rollbackError instanceof Error ? rollbackError.name : "UnknownError");
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function storeChapterInTransaction(
  connection: PoolConnection,
  storyId: number,
  ref: ChapterRef,
  content: string,
  skipExisting: boolean,
) {
  const body = content.trim();
  if (!body) throw new ImportSourceError("Nội dung chương rỗng; không ghi vào database.");

  const oldRows = await connection.query<ChapterRow[]>(`
    SELECT c.idCHUONG AS idChuong, c.is_deleted AS isDeleted, n.noi_dung AS noiDung
    FROM chuong c
    LEFT JOIN noi_dung_chuong n ON n.idCHUONG = c.idCHUONG
    WHERE c.idTRUYEN = ? AND c.chuong_so = ?
    LIMIT 1 FOR UPDATE
  `, [storyId, ref.number]);
  const old = oldRows[0];
  if (old?.isDeleted) throw new ImportSourceError("Không khôi phục chương đã xóa.");
  if (old?.noiDung?.trim() && skipExisting) return false;

  const slug = `chuong-${ref.number}`;
  const conflicts = await connection.query<Array<{ idChuong: number }>>(`
    SELECT idCHUONG AS idChuong FROM chuong
    WHERE idTRUYEN = ? AND slug = ?
    LIMIT 1 FOR UPDATE
  `, [storyId, slug]);
  if (conflicts[0] && Number(conflicts[0].idChuong) !== Number(old?.idChuong)) {
    throw new ImportSourceError("Slug chương xung đột với số chương khác.");
  }

  let chapterId = old ? Number(old.idChuong) : 0;
  if (!old) {
    const inserted = await connection.query<UpsertResult>(`
      INSERT INTO chuong (idTRUYEN, chuong_so, slug, tieu_de_chuong, is_free, gia_xu)
      VALUES (?, ?, ?, ?, TRUE, 0)
    `, [storyId, ref.number, slug, normalized(ref.title).slice(0, 300)]);
    chapterId = insertedId(inserted);
  }

  await connection.query<UpsertResult>(`
    INSERT INTO noi_dung_chuong (idCHUONG, noi_dung, content_type)
    VALUES (?, ?, 'db')
    ON DUPLICATE KEY UPDATE noi_dung = VALUES(noi_dung), content_type = VALUES(content_type)
  `, [chapterId, body]);
  if (old) {
    await connection.query<UpsertResult>(`
      UPDATE chuong SET tieu_de_chuong = ? WHERE idCHUONG = ?
    `, [normalized(ref.title).slice(0, 300), chapterId]);
  }
  return true;
}

async function createStoryMetadata(connection: PoolConnection, story: ScrapedStory, sourceUrl: string, cover: string) {
  await connection.query("SELECT idTHE_LOAI FROM the_loai FOR UPDATE");
  await connection.query("SELECT idTAC_GIA_DICH FROM tac_gia_dich FOR UPDATE");
  const genres = await connection.query<GenreRow[]>(`
    SELECT idTHE_LOAI AS idTheLoai, ten_the_loai AS tenTheLoai FROM the_loai
  `);
  const authors = await connection.query<AuthorRow[]>(`
    SELECT idTAC_GIA_DICH AS idTacGiaDich, ten FROM tac_gia_dich
  `);
  const genreMap = new Map(genres.map((row) => [metadataKey(row.tenTheLoai), Number(row.idTheLoai)]));
  const authorMap = new Map(authors.map((row) => [metadataKey(row.ten), Number(row.idTacGiaDich)]));
  const title = normalized(story.title).slice(0, 255);
  const inserted = await connection.query<UpsertResult>(`
    INSERT INTO truyen (
      ten_truyen, slug, mo_ta, anh_bia, anh_thumbnail, tag, trang_thai, luot_xem
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    title,
    story.slug.slice(0, 220),
    story.description,
    cover,
    cover || null,
    sourceTag(sourceUrl),
    story.completed ? "hoan_thanh" : "dang_tien_hanh",
    Math.min(4_294_967_295, Math.max(0, Math.floor(story.views))),
  ]);
  const storyId = insertedId(inserted);

  for (const name of new Set(story.genres.map((value) => normalized(value).slice(0, 100)).filter(Boolean))) {
    const key = metadataKey(name);
    let genreId = genreMap.get(key);
    if (!genreId) {
      const created = await connection.query<UpsertResult>(`
        INSERT INTO the_loai (ten_the_loai) VALUES (?)
      `, [name]);
      genreId = insertedId(created);
      genreMap.set(key, genreId);
    }
    await connection.query<UpsertResult>(`
      INSERT IGNORE INTO truyen_the_loai (idTRUYEN, idTHE_LOAI) VALUES (?, ?)
    `, [storyId, genreId]);
  }

  const usedAuthors = new Set<number>();
  for (const name of new Set(story.authors.map((value) => normalized(value).slice(0, 200)).filter(Boolean))) {
    const key = metadataKey(name);
    let authorId = authorMap.get(key);
    if (!authorId) {
      const created = await connection.query<UpsertResult>(`
        INSERT INTO tac_gia_dich (ten, loai) VALUES (?, 'tac_gia')
      `, [name]);
      authorId = insertedId(created);
      authorMap.set(key, authorId);
    }
    if (usedAuthors.has(authorId)) continue;
    await connection.query<UpsertResult>(`
      INSERT IGNORE INTO truyen_tac_gia_dich (idTRUYEN, idTAC_GIA_DICH, vai_tro)
      VALUES (?, ?, 'tac_gia_chinh')
    `, [storyId, authorId]);
    usedAuthors.add(authorId);
  }

  return {
    idTruyen: storyId,
    slug: story.slug.slice(0, 220),
    anhBia: cover,
    isDeleted: false,
  } satisfies StoredImportStory;
}

export function createMariaDbImportStorage(pool: Pool): ImportStorage {
  return {
    async ensureDatabase() {
      const rows = await pool.query<Array<{ db: string | null }>>("SELECT DATABASE() AS db");
      if (rows[0]?.db !== "web_truyen") {
        throw new ImportSourceError("Import chỉ được phép ghi database web_truyen.");
      }
    },

    async findStory(story, sourceUrl) {
      const exact = await exactStory(pool, story, sourceUrl);
      if (exact) return storedStory(exact);

      const title = normalized(story.title).slice(0, 255);
      const candidates = await pool.query<StoryRow[]>(`
        SELECT idTRUYEN AS idTruyen, slug, anh_bia AS anhBia, is_deleted AS isDeleted,
               ten_truyen AS tenTruyen, tag
        FROM truyen
        WHERE ten_truyen COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
        ORDER BY idTRUYEN ASC
        LIMIT 3
      `, [title]);
      const titleKey = metadataKey(title);
      const matching = candidates.filter((row) => metadataKey(row.tenTruyen) === titleKey);
      if (matching.length > 1) throw new ImportSourceError("Có nhiều truyện trùng tên; hãy kiểm tra thủ công.");
      if (matching[0]?.isDeleted) throw new ImportSourceError("Truyện đã bị xóa.");
      return matching[0] ? storedStory(matching[0]) : null;
    },

    async existingChapterNumbers(storyId) {
      const rows = await pool.query<Array<{ chapterNumber: string | number }>>(`
        SELECT c.chuong_so AS chapterNumber
        FROM chuong c
        JOIN noi_dung_chuong n ON n.idCHUONG = c.idCHUONG
        WHERE c.idTRUYEN = ? AND n.noi_dung REGEXP '[^[:space:]]'
      `, [storyId]);
      return new Set(rows.map((row) => Number(row.chapterNumber)));
    },

    async createStoryWithChapter(story, sourceUrl, cover, chapter, content) {
      return inTransaction(pool, async (connection) => {
        const existing = await exactStory(connection, story, sourceUrl, true);
        const stored = existing ? storedStory(existing) : await createStoryMetadata(connection, story, sourceUrl, cover);
        await storeChapterInTransaction(connection, stored.idTruyen, chapter, content, true);
        await connection.query<UpsertResult>(`
          UPDATE truyen
          SET so_chuong = (SELECT COUNT(*) FROM chuong WHERE idTRUYEN = ?)
          WHERE idTRUYEN = ?
        `, [stored.idTruyen, stored.idTruyen]);
        return stored;
      });
    },

    async storeChapter(storyId, chapter, content, skipExisting) {
      return inTransaction(pool, (connection) => storeChapterInTransaction(connection, storyId, chapter, content, skipExisting));
    },

    async refreshChapterCount(storyId) {
      await pool.query<UpsertResult>(`
        UPDATE truyen
        SET so_chuong = (SELECT COUNT(*) FROM chuong WHERE idTRUYEN = ?)
        WHERE idTRUYEN = ?
      `, [storyId, storyId]);
    },
  };
}
