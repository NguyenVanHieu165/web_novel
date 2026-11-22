import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { AdminStoryQuery } from "@/schemas/admin-story-query.schema";

// Prisma cannot filter a relation count in findMany. Parameterized SQL selects
// only this page's IDs; Prisma then projects metadata and actual relation counts.
export async function listAdminStories(query: AdminStoryQuery) {
  const conditions = [Prisma.sql`t.is_deleted = false`];
  if (query.q) {
    const keyword = `%${query.q.replace(/[!%_]/g, "!$&")}%`;
    conditions.push(Prisma.sql`(t.ten_truyen LIKE ${keyword} ESCAPE '!' OR EXISTS (
      SELECT 1 FROM truyen_tac_gia_dich a JOIN tac_gia_dich author
      ON author.idTAC_GIA_DICH = a.idTAC_GIA_DICH
      WHERE a.idTRUYEN = t.idTRUYEN AND author.loai IN ('tac_gia', 'both')
      AND author.ten LIKE ${keyword} ESCAPE '!'))`);
  }
  if (query.genreId || query.genre) {
    conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM truyen_the_loai g
      JOIN the_loai genre ON genre.idTHE_LOAI = g.idTHE_LOAI
      WHERE g.idTRUYEN = t.idTRUYEN
      ${query.genreId ? Prisma.sql`AND g.idTHE_LOAI = ${query.genreId}` : Prisma.empty}
      ${query.genre ? (/^[1-9]\d*$/.test(query.genre)
        ? Prisma.sql`AND g.idTHE_LOAI = ${Number(query.genre)}`
        : Prisma.sql`AND genre.ten_the_loai = ${query.genre}`) : Prisma.empty})`);
  }
  if (query.status !== "all") {
    conditions.push(Prisma.sql`t.trang_thai = ${query.status === "dang_ra" ? "dang_tien_hanh" : query.status}`);
  }
  const count = Prisma.sql`COALESCE(ch.chapter_count, 0)`;
  if (query.chapterRange === "empty") conditions.push(Prisma.sql`${count} = 0`);
  if (query.chapterRange === "1-20") conditions.push(Prisma.sql`${count} BETWEEN 1 AND 20`);
  if (query.chapterRange === "21-100") conditions.push(Prisma.sql`${count} BETWEEN 21 AND 100`);
  // 100 belongs to 21-100; 100+ means more than 100.
  if (query.chapterRange === "100+") conditions.push(Prisma.sql`${count} > 100`);
  if (query.vipOnly === "true") conditions.push(Prisma.sql`COALESCE(ch.vip_count, 0) > 0`);
  const columns = {
    id: Prisma.sql`t.idTRUYEN`, tenTruyen: Prisma.sql`t.ten_truyen`,
    soChuong: count, luotXem: Prisma.sql`t.luot_xem`,
    ngayTao: Prisma.sql`t.created_at`, trang_thai: Prisma.sql`t.trang_thai`,
  };
  const direction = query.sortOrder === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const needsCounts = query.chapterRange !== "all" || query.vipOnly === "true" || query.sortBy === "soChuong";
  const from = Prisma.sql`FROM truyen t ${needsCounts ? Prisma.sql`LEFT JOIN (
    SELECT idTRUYEN, COUNT(*) AS chapter_count, SUM(is_free = false) AS vip_count
    FROM chuong WHERE is_deleted = false GROUP BY idTRUYEN
  ) ch ON ch.idTRUYEN = t.idTRUYEN` : Prisma.empty}
    WHERE ${Prisma.join(conditions, " AND ")}`;

  return prisma.$transaction(async (tx) => {
    const [ids, totals, genres] = await Promise.all([
      tx.$queryRaw<{ idTruyen: number }[]>(Prisma.sql`SELECT t.idTRUYEN AS idTruyen ${from}
        ORDER BY ${columns[query.sortBy]} ${direction}, t.idTRUYEN ${direction}
        LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`),
      tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS total ${from}`),
      // All genre names are needed by the admin dropdown (small lookup table).
      tx.theLoai.findMany({ select: { idTheLoai: true, tenTheLoai: true }, orderBy: { tenTheLoai: "asc" } }),
    ]);
    const pageIds = ids.map((row) => row.idTruyen);
    const [stories, vipCounts] = pageIds.length ? await Promise.all([
      tx.truyen.findMany({
        where: { idTruyen: { in: pageIds } },
        select: {
          idTruyen: true, tenTruyen: true, slug: true, anhBia: true, anhThumbnail: true,
          trang_thai: true, createdAt: true, luotXem: true,
          truyenTheLoai: { select: { idTheLoai: true, theLoai: { select: { idTheLoai: true, tenTheLoai: true } } } },
          _count: { select: { chuong: { where: { isDeleted: false } } } },
        },
      }),
      tx.chuong.groupBy({ by: ["idTruyen"], where: { idTruyen: { in: pageIds }, isDeleted: false, isFree: false }, _count: { _all: true } }),
    ]) : [[], []];
    const byId = new Map(stories.map((story) => [story.idTruyen, story]));
    const vipById = new Map(vipCounts.map((row) => [row.idTruyen, row._count._all]));
    return {
      data: pageIds.map((id) => {
        const story = byId.get(id)!;
        return { ...story, soChuong: story._count.chuong, soChuongVip: vipById.get(id) ?? 0 };
      }),
      meta: { page: query.page, limit: query.limit, total: Number(totals[0].total), totalPage: Math.max(1, Math.ceil(Number(totals[0].total) / query.limit)) },
      genres,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
