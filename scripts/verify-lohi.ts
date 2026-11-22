import "dotenv/config";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { prisma as db } from "../lib/prisma";
import { normalizeVietnameseText } from "../lib/vietnamese-text";
import { key } from "./crawl-truyendocviet";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, "node_modules/.cache/crawl-lohi");
const entrySchema = z.object({ book: z.object({ slug: z.string(), id: z.string(), titleVi: z.string(), completionStatus: z.string() }), localId: z.number().optional(), done: z.boolean(), saved: z.number(), skipped: z.array(z.number()) });
const serialize = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
async function main() {
try {
  assert.equal(process.env.DATABASE_NAME, "web_truyen");
  assert.equal((await db.$queryRaw<Array<{ db: string }>>`SELECT DATABASE() AS db`)[0]?.db, "web_truyen");
  const baseline = z.object({ schemaHash: z.string(), stories: z.array(z.object({ idTruyen: z.number() }).passthrough()), chapters: z.array(z.object({ idChuong: z.number() }).passthrough()), genres: z.array(z.object({ idTheLoai: z.number() }).passthrough()), authors: z.array(z.object({ idTacGiaDich: z.number() }).passthrough()) }).parse(JSON.parse(await readFile(path.join(CACHE, "baseline.json"), "utf8")));
  const manifest = z.object({ entries: z.array(entrySchema) }).parse(JSON.parse(await readFile(path.join(CACHE, "manifest.json"), "utf8")));
  assert.equal(createHash("sha256").update(await readFile(path.join(ROOT, "prisma/schema.prisma"))).digest("hex"), baseline.schemaHash);
  const legacyStories = await db.truyen.findMany({ where: { idTruyen: { in: baseline.stories.map(b => b.idTruyen) } }, orderBy: { idTruyen: "asc" } });
  const legacyChapters = await db.chuong.findMany({ where: { idChuong: { in: baseline.chapters.map(c => c.idChuong) } }, orderBy: { idChuong: "asc" }, include: { noiDungChuong: true } });
  assert.deepEqual(serialize(legacyStories), baseline.stories);
  assert.deepEqual(serialize(legacyChapters), baseline.chapters);
  const ids = manifest.entries.flatMap(e => e.localId ? [e.localId] : []);
  const stories = await db.truyen.findMany({ where: { idTruyen: { in: ids } }, select: { idTruyen: true, tenTruyen: true, tag: true, anhBia: true, moTa: true, soChuong: true, _count: { select: { truyenTheLoai: true, truyen_tac_gia_dich: true } } } });
  const genreRows = await db.theLoai.findMany({ orderBy: { idTheLoai: "asc" } });
  const authorRows = await db.tacGiaDich.findMany({ orderBy: { idTacGiaDich: "asc" } });
  assert.deepEqual(serialize(genreRows.filter(g => baseline.genres.some(old => old.idTheLoai === g.idTheLoai))), baseline.genres);
  assert.deepEqual(serialize(authorRows.filter(a => baseline.authors.some(old => old.idTacGiaDich === a.idTacGiaDich))), baseline.authors);
  const newGenres = genreRows.filter(g => !baseline.genres.some(old => old.idTheLoai === g.idTheLoai));
  const newAuthors = authorRows.filter(a => !baseline.authors.some(old => old.idTacGiaDich === a.idTacGiaDich));
  for (const g of newGenres) assert.equal(genreRows.filter(row => key(row.tenTheLoai) === key(g.tenTheLoai)).length, 1, "New duplicate genre");
  for (const a of newAuthors) assert.equal(authorRows.filter(row => key(row.ten) === key(a.ten)).length, 1, "New duplicate author");
  const chapterNumbers = new Map<number, Set<number>>();
  const slugs = new Set<string>();
  let cursor = 0, chapters = 0;
  for (;;) {
    const rows = await db.chuong.findMany({ where: { idTruyen: { in: ids }, idChuong: { gt: cursor } }, orderBy: { idChuong: "asc" }, take: 200, select: { idChuong: true, idTruyen: true, chuongSo: true, slug: true, tieuDeChuong: true, noiDungChuong: { select: { noiDung: true } } } });
    if (!rows.length) break;
    for (const row of rows) {
      const content = row.noiDungChuong?.noiDung;
      assert.ok(content, "Empty imported body");
      assert.ok(content.trim(), "Empty imported body");
      assert.equal(normalizeVietnameseText(content), content);
      assert.equal(normalizeVietnameseText(row.tieuDeChuong), row.tieuDeChuong);
      assert.ok(!/<(?:script|style|iframe)\b/i.test(content));
      const numbers = chapterNumbers.get(row.idTruyen) ?? new Set<number>();
      assert.ok(!numbers.has(Number(row.chuongSo)), "Duplicate chapter number"); numbers.add(Number(row.chuongSo)); chapterNumbers.set(row.idTruyen, numbers);
      assert.ok(!slugs.has(`${row.idTruyen}/${row.slug}`), "Duplicate chapter slug"); slugs.add(`${row.idTruyen}/${row.slug}`);
    }
    chapters += rows.length; cursor = rows[rows.length - 1].idChuong;
  }
  for (const story of stories) {
    assert.equal(normalizeVietnameseText(story.tenTruyen), story.tenTruyen);
    assert.equal(normalizeVietnameseText(story.moTa || ""), story.moTa || "");
    assert.ok(story._count.truyenTheLoai > 0 && story._count.truyen_tac_gia_dich > 0);
    assert.ok(story.anhBia.startsWith("/uploads/covers/lohi-"));
    await sharp(path.join(ROOT, "public", story.anhBia.slice(1))).metadata();
    assert.equal(story.soChuong, chapterNumbers.get(story.idTruyen)?.size ?? 0);
  }
  let completeCatalogues = 0;
  for (const e of manifest.entries.filter(e => e.done && e.localId)) {
    const localId = e.localId;
    if (!localId) continue;
    const refs = z.array(z.object({ chapterNumber: z.number() })).parse(JSON.parse(await readFile(path.join(CACHE, `chapters-${e.book.id}.json`), "utf8")));
    assert.equal(e.saved, chapterNumbers.get(localId)?.size);
    for (const ref of refs) assert.ok(chapterNumbers.get(localId)?.has(ref.chapterNumber) || e.skipped.includes(ref.chapterNumber), "Catalogue has an unprocessed chapter");
    completeCatalogues++;
  }
  assert.equal(new Set(manifest.entries.map(e => key(e.book.titleVi))).size, 110);
  assert.ok(manifest.entries.slice(0, 15).every(e => e.book.completionStatus === "completed"));
  const result = { database: "web_truyen", schemaUnchanged: true, legacyStoriesUnchanged: legacyStories.length, legacyChaptersUnchanged: legacyChapters.length,
    importedStories: stories.length, importedChapters: chapters, decodedCovers: stories.length, newGenres: newGenres.length, newAuthors: newAuthors.length,
    newMetadataDuplicates: 0, chapterDuplicates: 0, allImportedTextNormalized: true, completeCatalogues };
  await writeFile(path.join(CACHE, "verification.json"), JSON.stringify(result, null, 2));
  const reportPath = path.join(ROOT, "scripts/crawl-lohi-results.json");
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  await writeFile(reportPath, JSON.stringify({ ...report, verification: result }, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Verification failed"); process.exitCode = 1; });
