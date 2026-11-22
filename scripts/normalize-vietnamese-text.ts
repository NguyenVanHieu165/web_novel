/** Run with the existing tsx loader; never fetches the crawl source. */
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { normalizeVietnameseText } from "../lib/vietnamese-text";
import { normalizeStoredText } from "./crawl-stories";

const root = path.resolve(import.meta.dirname, "..");
const cache = path.join(root, "node_modules/.cache/normalize-vietnamese");

async function main() {
  if (process.env.DATABASE_NAME !== "web_truyen") throw new Error("DATABASE_NAME must be web_truyen");
  const { prisma } = await import("../lib/prisma");
  try {
    const target = await prisma.$queryRaw<Array<{ db: string }>>`SELECT DATABASE() AS db`;
    if (target[0]?.db !== "web_truyen") throw new Error("Actual database is not web_truyen");
    console.log("Verified database: web_truyen");
    async function snapshot() {
      const stories = [];
      let storyId = 0;
      for (;;) {
        const rows = await prisma.truyen.findMany({ where: { idTruyen: { gt: storyId } }, orderBy: { idTruyen: "asc" }, take: 100 });
        if (!rows.length) break;
        stories.push(...rows); storyId = rows[rows.length - 1].idTruyen;
      }
      const chapters = [];
      let chapterId = 0;
      for (;;) {
        const rows = await prisma.chuong.findMany({ where: { idChuong: { gt: chapterId } }, orderBy: { idChuong: "asc" }, take: 50, include: { noiDungChuong: true } });
        if (!rows.length) break;
        chapters.push(...rows); chapterId = rows[rows.length - 1].idChuong;
      }
      return { stories, chapters };
    }
    function audit(data: Awaited<ReturnType<typeof snapshot>>) {
      const texts = [
        ...data.stories.flatMap(row => [row.tenTruyen, row.moTa, row.tag]),
        ...data.chapters.flatMap(row => [row.tieuDeChuong, row.noiDungChuong?.noiDung]),
      ].filter((value): value is string => value != null);
      return {
        stories: data.stories.length, chapters: data.chapters.length,
        nonNfcFields: texts.filter(value => value !== value.normalize("NFC")).length,
        repairableFields: texts.filter(value => value !== normalizeVietnameseText(value)).length,
        detachedMarkFields: texts.filter(value => /[\u0300-\u036f]|[\p{L}\p{M}][\u00b4\u0060\u02ca\u02cb\u02c6\u02dc\u02d8]/u.test(value)).length,
      };
    }
    await mkdir(cache, { recursive: true });
    const before = await snapshot();
    const backup = path.join(cache, `before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await writeFile(backup, JSON.stringify(before), "utf8");
    const schemaHash = createHash("sha256").update(await readFile(path.join(root, "prisma/schema.prisma"))).digest("hex");
    const beforeAudit = audit(before);
    const changed = await normalizeStoredText(prisma);
    const after = await snapshot();
    const afterAudit = audit(after);
    if (before.stories.length !== after.stories.length || before.chapters.length !== after.chapters.length) throw new Error("Row counts changed during normalization");
    for (const [index, row] of before.chapters.entries()) {
      const current = after.chapters[index];
      if (row.idChuong !== current.idChuong || row.slug !== current.slug || row.idTruyen !== current.idTruyen || row.isFree !== current.isFree || row.giaXu !== current.giaXu) throw new Error("Chapter identifiers or paywall data changed");
      if (row.noiDungChuong?.noiDung != null && current.noiDungChuong?.noiDung !== normalizeVietnameseText(row.noiDungChuong.noiDung)) throw new Error("Chapter text differs from expected normalization");
    }
    if (createHash("sha256").update(await readFile(path.join(root, "prisma/schema.prisma"))).digest("hex") !== schemaHash) throw new Error("Schema changed");
    const sample = after.chapters.find(row => row.isFree && ["thiết", "luồng", "Hắn"].every(word => row.noiDungChuong?.noiDung?.includes(word)));
    const sampleCodePoints = sample ? {
      idChuong: sample.idChuong, idNoiDungChuong: sample.noiDungChuong?.idNoiDungChuong,
      words: ["thiết", "luồng", "Hắn"].map(word => ({ word, codePoints: [...word].map(char => `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`) })),
    } : null;
    const report = { database: "web_truyen", finishedAt: new Date().toISOString(), before: beforeAudit, changed, after: afterAudit, sampleCodePoints, schemaUnchanged: true, chapterIdsAndPricesPreserved: true, backup };
    await writeFile(path.join(root, "scripts/normalize-vietnamese-results.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
    if (afterAudit.nonNfcFields || afterAudit.repairableFields || afterAudit.detachedMarkFields) throw new Error("Residual detached accents require review; backup and report saved");
  } finally { await prisma.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Normalization failed"); process.exitCode = 1; });
