/**
 * Preview: node --import ./socket-server/node_modules/tsx/dist/loader.mjs scripts/prune-empty-stories.ts --dry-run
 * Execute: same command without --dry-run. Only stories with no chapter ROWS qualify.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, open, readFile, readdir, realpath, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Prisma, PrismaClient } from "../app/generated/prisma/client";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, "node_modules/.cache/prune-empty-stories");
const COVERS = path.join(ROOT, "public/uploads/covers");
const candidateSelect = { idTruyen: true, tenTruyen: true, slug: true, anhBia: true, anhThumbnail: true } as const;

async function collect<T>(fetch: (after: number) => Promise<T[]>, getId: (row: T) => number) {
  const all: T[] = [];
  let after = 0;
  for (;;) {
    const rows = await fetch(after);
    if (!rows.length) return all;
    all.push(...rows);
    after = getId(rows[rows.length - 1]);
  }
}

export async function candidates(db: PrismaClient) {
  return collect(after => db.truyen.findMany({ where: { idTruyen: { gt: after }, chuong: { none: {} } }, orderBy: { idTruyen: "asc" }, take: 100, select: candidateSelect }), row => row.idTruyen);
}

/** The parent row lock prevents FK-checked chapter inserts until commit/rollback. */
export async function deleteEmptyStory(tx: Prisma.TransactionClient, id: number) {
  const locked = await tx.$queryRaw<Array<{ id: number }>>`SELECT idTRUYEN AS id FROM truyen WHERE idTRUYEN = ${id} FOR UPDATE`;
  if (!locked.length) return { status: "already-missing" as const };
  const story = await tx.truyen.findFirst({ where: { idTruyen: id, chuong: { none: {} } }, select: candidateSelect });
  if (!story) return { status: "has-chapters" as const };
  // Bad cross-story volume/comment links must never cause a retained chapter to change.
  if (await tx.chuong.count({ where: { quyen: { idTRUYEN: id } } })) throw new Error(`Story ${id}: a volume is referenced by a chapter; no deletion`);
  if (await tx.binhLuan.count({ where: { idTRUYEN: id, idChuong: { not: null } } })) throw new Error(`Story ${id}: comment links to another story's chapter; no deletion`);
  const deleted = {
    commentLikes: (await tx.likeBinhLuan.deleteMany({ where: { binhLuan: { idTRUYEN: id } } })).count,
    comments: (await tx.binhLuan.deleteMany({ where: { idTRUYEN: id } })).count,
    ratings: (await tx.danhGiaTruyen.deleteMany({ where: { idTruyen: id } })).count,
    follows: (await tx.theoDoiTruyen.deleteMany({ where: { idTruyen: id } })).count,
    history: (await tx.lichSuDoc.deleteMany({ where: { idTruyen: id } })).count,
    genres: (await tx.truyenTheLoai.deleteMany({ where: { idTruyen: id } })).count,
    authors: (await tx.truyen_tac_gia_dich.deleteMany({ where: { idTRUYEN: id } })).count,
    volumes: (await tx.quyen.deleteMany({ where: { idTRUYEN: id } })).count,
  };
  // Repeat the relation predicate on the final DELETE; never rely on soChuong.
  const removed = await tx.truyen.deleteMany({ where: { idTruyen: id, chuong: { none: {} } } });
  if (removed.count !== 1) throw new Error(`Story ${id} changed while pruning; transaction rolled back`);
  return { status: "deleted" as const, story, deleted };
}

export function localCoverName(reference: string | null, allowAbsolute = false): string | null {
  if (!reference) return null;
  if ((!reference.startsWith("/") || reference.startsWith("//")) && !allowAbsolute) return null;
  try {
    let url = new URL(reference, "https://local.invalid");
    for (let depth = 0; depth < 4 && url.pathname === "/_next/image"; depth++) {
      const nested = url.searchParams.get("url");
      if (!nested) return null;
      url = new URL(nested, url.origin);
    }
    if (!allowAbsolute && url.origin !== "https://local.invalid") return null;
    const pathname = decodeURIComponent(url.pathname);
    const match = /^\/uploads\/covers\/([^/\\]+)$/.exec(pathname);
    if (!match || !/^[\w-][\w.-]*\.(?:webp|png|jpe?g|avif|gif)$/i.test(match[1])) return null;
    if (pathname !== path.posix.normalize(pathname)) return null;
    return match[1];
  } catch { return null; }
}

async function retainedSnapshot(db: PrismaClient) {
  // Full snapshots are intentional here: they prove preservation of ALL retained data.
  // Root reads are paged; nested collections are confined to the retained stories/chapters.
  const stories = await collect(after => db.truyen.findMany({
    where: { idTruyen: { gt: after }, chuong: { some: {} } }, orderBy: { idTruyen: "asc" }, take: 50,
    include: { truyenTheLoai: true, truyen_tac_gia_dich: true, quyen: true, binh_luan: { include: { likeBinhLuan: true } }, danhGiaTruyen: true, theoDoiTruyen: true, lichSuDoc: true },
  }), row => row.idTruyen);
  const chapters = await collect(after => db.chuong.findMany({
    where: { idChuong: { gt: after } }, orderBy: { idChuong: "asc" }, take: 50,
    include: { noiDungChuong: true, chuongDaMua: true, tienDoDoc: true, lichSuDoc: true, binhLuan: { include: { likeBinhLuan: true } } },
  }), row => row.idChuong);
  return { stories, chapters };
}

export function fingerprint(value: unknown): string {
  function canonical(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => [key, canonical(val)]));
    return item;
  }
  return createHash("sha256").update(JSON.stringify(canonical(JSON.parse(JSON.stringify(value))))).digest("hex");
}

async function stats(db: PrismaClient) {
  const [stories, empty, chapters, normal, vip] = await Promise.all([
    db.truyen.count(), db.truyen.count({ where: { chuong: { none: {} } } }), db.chuong.count(),
    db.chuong.count({ where: { OR: [{ isFree: true }, { isFree: null }] } }),
    db.chuong.count({ where: { isFree: false, giaXu: { gt: 0 } } }),
  ]);
  return { stories, empty, chapters, normal, vip };
}

async function json(file: string, value: unknown) {
  await writeFile(`${file}.tmp`, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(`${file}.tmp`, file);
}

export async function cleanCovers(db: PrismaClient, references: Array<string | null>, backupDirectory: string) {
  const removed: string[] = [];
  const skipped: string[] = [];
  const names = new Set(references.map(ref => localCoverName(ref)).filter((name): name is string => name !== null));
  if (!names.size) return { removed, skipped };
  let files: string[];
  try { files = await readdir(COVERS); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { removed, skipped: [...names] }; throw error; }
  const coverRoot = await realpath(COVERS);
  const workspace = await realpath(ROOT);
  const relative = path.relative(workspace, coverRoot);
  if ((await lstat(COVERS)).isSymbolicLink() || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Cover directory resolves outside workspace or is a symlink");
  await mkdir(backupDirectory, { recursive: true });
  for (const name of names) {
    if (!files.includes(name)) { skipped.push(name); continue; }
    const file = path.resolve(coverRoot, name);
    if (path.dirname(file) !== coverRoot) throw new Error("Unsafe cover path");
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) { skipped.push(name); continue; }
    // Re-read references AFTER the database commits. Include thumbnails and URL
    // optimizer aliases, preserving a shared image even if another story uses it.
    const live = await collect(after => db.truyen.findMany({ where: { idTruyen: { gt: after } }, orderBy: { idTruyen: "asc" }, take: 100, select: { idTruyen: true, anhBia: true, anhThumbnail: true } }), row => row.idTruyen);
    if (live.some(story => [story.anhBia, story.anhThumbnail].some(ref => localCoverName(ref, true) === name))) { skipped.push(name); continue; }
    await copyFile(file, path.join(backupDirectory, name));
    await unlink(file);
    removed.push(name);
  }
  return { removed, skipped };
}

export async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--dry-run")) throw new Error("Usage: prune-empty-stories.ts [--dry-run]");
  const dryRun = args.includes("--dry-run");
  if (process.env.DATABASE_NAME !== "web_truyen") throw new Error("DATABASE_NAME must be web_truyen");
  await mkdir(CACHE, { recursive: true });
  const lockFile = path.join(CACHE, "run.lock");
  const lock = await open(lockFile, "wx");
  await lock.writeFile(String(process.pid));
  let db: PrismaClient | undefined;
  try {
    db = (await import("../lib/prisma")).prisma;
    const client = db;
    const target = await db.$queryRaw<Array<{ db: string }>>`SELECT DATABASE() AS db`;
    if (target[0]?.db !== "web_truyen") throw new Error("Actual connected database is not web_truyen");
    console.log(`Verified database: web_truyen; mode=${dryRun ? "dry-run" : "delete"}`);
    const found = await candidates(db);
    const before = await stats(db);
    if (dryRun) for (const story of found) console.log(JSON.stringify(story));
    console.log(`Empty story candidates: ${found.length}`);
    const directory = path.join(CACHE, `${new Date().toISOString().replace(/[:.]/g, "-")}-${dryRun ? "preview" : "execute"}`);
    await mkdir(directory, { recursive: true });
    const preview = { database: "web_truyen", dryRun, before, candidates: found };
    await json(path.join(directory, "preview.json"), preview);
    if (dryRun) { console.log(`Dry-run only; no rows or covers changed. Report: ${directory}`); return; }
    const preserved = await retainedSnapshot(db);
    const schemaHash = createHash("sha256").update(await readFile(path.join(ROOT, "prisma/schema.prisma"))).digest("hex");
    // Recoverable backup of candidate rows and dependencies; no user credentials.
    const backup = await collect(after => client.truyen.findMany({ where: { idTruyen: { gt: after }, chuong: { none: {} } }, orderBy: { idTruyen: "asc" }, take: 50,
      include: { truyenTheLoai: true, truyen_tac_gia_dich: true, quyen: true, binh_luan: { include: { likeBinhLuan: true } }, danhGiaTruyen: true, theoDoiTruyen: true, lichSuDoc: true },
    }), row => row.idTruyen);
    await json(path.join(directory, "before.json"), { preview, backup, preserved, schemaHash });
    const results: Array<{ id: number; status: string; error?: string }> = [];
    const coverReferences: Array<string | null> = [];
    for (const story of found) {
      try {
        const result = await db.$transaction(tx => deleteEmptyStory(tx, story.idTruyen), { isolationLevel: "Serializable", timeout: 15000 });
        results.push({ id: story.idTruyen, status: result.status });
        if (result.status === "deleted") coverReferences.push(result.story.anhBia, result.story.anhThumbnail);
      } catch (error) {
        results.push({ id: story.idTruyen, status: "failed", error: error instanceof Error ? error.message : "Pruning failed" });
      }
      await json(path.join(directory, "deletions.json"), { results, coverReferences });
    }
    const afterSnapshot = await retainedSnapshot(db);
    const retainedUnchanged = fingerprint(preserved) === fingerprint(afterSnapshot);
    if (!retainedUnchanged) throw new Error(`Retained data changed; review snapshots at ${directory} before cover cleanup`);
    if (createHash("sha256").update(await readFile(path.join(ROOT, "prisma/schema.prisma"))).digest("hex") !== schemaHash) throw new Error("Schema changed during execution");
    const covers = await cleanCovers(db, coverReferences, path.join(directory, "covers-backup"));
    const after = await stats(db);
    const report = { database: "web_truyen", finishedAt: new Date().toISOString(), before, after, deletedStories: results.filter(row => row.status === "deleted").length, deletedCovers: covers.removed.length, retainedUnchanged, schemaUnchanged: true, backupDirectory: directory, candidates: found, results, covers };
    await json(path.join(directory, "report.json"), report);
    await json(path.join(ROOT, "scripts/prune-empty-stories-results.json"), report);
    console.table({ before, after });
    console.log(`Deleted stories: ${report.deletedStories}; deleted covers: ${report.deletedCovers}; retained data unchanged: ${retainedUnchanged}`);
    console.log(`Backup/report: ${directory}`);
    if (after.empty !== 0 || results.some(row => row.status === "failed")) process.exitCode = 2;
  } finally {
    await db?.$disconnect();
    await lock.close();
    await unlink(lockFile);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : "Pruning failed"); process.exitCode = 1; });
}
