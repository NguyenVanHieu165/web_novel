/** Run with the project's existing tsx loader: crawl-lohi.ts --limit=3|110 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { access, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { PrismaClient } from "../app/generated/prisma/client";
import { normalizeVietnameseText } from "../lib/vietnamese-text";
import { cleanContent } from "./crawl-stories";
import { key, text, NameRegistry } from "./crawl-truyendocviet";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, "node_modules/.cache/crawl-lohi");
const COVERS = path.join(ROOT, "public/uploads/covers");
const MANIFEST = path.join(CACHE, "manifest.json");
const STOP = path.join(CACHE, "source-stopped.json");
const API = "https://api.lohi2.com/novel";
const bookSchema = z.object({
  id: z.string().uuid(), slug: z.string().regex(/^[a-z0-9-]+$/), titleVi: z.string().min(1),
  authorVi: z.string().nullish(), authorNameVi: z.string().nullish(), synopsis: z.string().nullish(),
  completionStatus: z.string(), coverImageUrl: z.string().url().nullable(), genres: z.array(z.string()),
  totalChapters: z.number().int().nonnegative(), readCount: z.number().nonnegative().default(0),
  vipFromChapter: z.number().int().nullish(), access: z.string(),
});
const chapterSchema = z.object({
  id: z.string().uuid(), chapterNumber: z.number().int().positive().max(999999),
  titleVi: z.string().nullish(), wordCount: z.number().nonnegative().nullish(),
  isVip: z.boolean().optional(), isLocked: z.boolean().optional(),
});
type Book = z.infer<typeof bookSchema>;
type Chapter = z.infer<typeof chapterSchema>;
export function excludedContentTitle(value: string) {
  return /(?:\bcao\s*h\b|\[h\]|\b18\+|\br18\b|\bh\s*văn\b|sắc hiệp|dâm loạn)/iu.test(text(value));
}
const entrySchema = z.object({
  book: bookSchema, localId: z.number().optional(), done: z.boolean().default(false),
  saved: z.number().default(0), skipped: z.array(z.number()).default([]), error: z.string().optional(),
});
const totalsSchema = z.object({ stories: z.number(), chapters: z.number(), normal: z.number(), vip: z.number(), genres: z.number(), authors: z.number() });
const manifestSchema = z.object({ version: z.literal(1), initial: totalsSchema, entries: z.array(entrySchema) });
type Manifest = z.infer<typeof manifestSchema>;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function exists(file: string) {
  try { await access(file); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}
async function json(file: string, value: unknown) {
  await writeFile(file + ".tmp", JSON.stringify(value, null, 2) + "\n");
  await rename(file + ".tmp", file);
}

export function cleanLohiText(value: string) {
  return normalizeVietnameseText(cleanContent(value)).split("\n")
    .filter(line => !/(?:https?:\/\/|www\.)\S*(?:lohi2\.(?:com|uk)|2novel\.app)/i.test(line))
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
export function publicBody(value: unknown) {
  const parsed = z.object({ titleVi: z.string().nullish(), content: z.string().nullish(),
    isVip: z.boolean().optional(), isLocked: z.boolean().optional(), preview: z.boolean().optional(),
    truncated: z.boolean().optional(), requiresLogin: z.boolean().optional() }).parse(value);
  if (parsed.isVip || parsed.isLocked || parsed.preview || parsed.truncated || parsed.requiresLogin || !parsed.content) return null;
  const content = cleanLohiText(parsed.content);
  if (content.length < 100 || /(?:đăng nhập để (?:đọc|xem)|nâng cấp vip để|mua chương để)/i.test(content)) return null;
  return { title: parsed.titleVi ? text(parsed.titleVi) : null, content };
}
export function retryAfterMs(header: string | null, body: unknown, now = Date.now()) {
  const data = z.object({ details: z.object({ retryAfter: z.number().nonnegative().optional() }).optional() }).safeParse(body);
  const seconds = data.success ? data.data.details?.retryAfter ?? 0 : 0;
  const declared = header && /^\d+$/.test(header) ? Number(header) * 1000 : header ? Date.parse(header) - now : 0;
  return Math.max(3000, seconds * 1000, Number.isFinite(declared) ? declared : 0);
}

/** Prefer complete short novels, then cover each available genre before filling. */
export function chooseBooks(pool: Book[], excluded: Set<string>, limit = 110) {
  const candidates = pool.filter(b => b.access === "open" && b.coverImageUrl && !excludedContentTitle(b.titleVi) && b.totalChapters > 0 && !excluded.has(b.slug) && !excluded.has(key(b.titleVi)))
    .sort((a, b) => a.totalChapters - b.totalChapters || a.slug.localeCompare(b.slug));
  const chosen: Book[] = [], seen = new Set<string>();
  const add = (b: Book) => {
    if (chosen.length >= limit || seen.has(b.id) || seen.has(b.slug) || seen.has(key(b.titleVi))) return;
    chosen.push(b); seen.add(b.id); seen.add(b.slug); seen.add(key(b.titleVi));
  };
  for (const b of candidates.filter(b => b.completionStatus === "completed").slice(0, 30)) {
    add(b); if (chosen.length === Math.min(15, limit)) break;
  }
  const wanted = ["Tiên Hiệp", "Huyền Huyễn", "Kiếm Hiệp", "Khoa huyễn", "Ngôn Tình", "Hiện đại", "Cổ đại", "Xuyên không", "Trọng sinh", "Đồng Nhân", "Điền văn"];
  for (const genre of wanted) {
    if (chosen.some(b => b.genres.some(g => key(g) === key(genre)))) continue;
    const b = candidates.find(b => b.genres.some(g => key(g) === key(genre)));
    if (b) add(b);
  }
  for (const b of candidates) add(b);
  return chosen;
}

let stopped = false, active = 0, nextStart = 0, cooldown = 0, interval = 300;
let throttles = 0;
const queue: Array<() => void> = [];
async function throttle() {
  await wait(150 + Math.floor(Math.random() * 201));
  for (;;) {
    const start = Math.max(Date.now(), nextStart, cooldown);
    nextStart = start + interval;
    await wait(Math.max(0, start - Date.now()));
    if (Date.now() >= cooldown) return;
  }
}
async function request(url: string, image = false): Promise<{ data: unknown; type: string }> {
  const target = new URL(url);
  if (target.protocol !== "https:" || !["lohi2.com", "api.lohi2.com", "image.lohi2.com"].includes(target.hostname)) throw new Error("Unexpected source host");
  if (active >= 5) await new Promise<void>(resolve => queue.push(resolve)); else active++;
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      if (stopped) throw new Error("SOURCE_STOPPED");
      await throttle();
      if (stopped) throw new Error("SOURCE_STOPPED");
      let response: Response;
      try {
        response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30000), headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
          Accept: image ? "image/avif,image/webp,image/*" : "application/json",
        } });
      } catch {
        if (attempt < 4) { await wait(3000 * (attempt + 1)); continue; }
        throw new Error(`Network timeout/failure: ${target.pathname}`);
      }
      if ([429, 503].includes(response.status)) {
        const retry = response.headers.get("retry-after");
        const errorBody: unknown = await response.json().catch(() => null);
        cooldown = Math.max(cooldown, Date.now() + Math.max(3000 * 2 ** attempt, retryAfterMs(retry, errorBody)) + 1000);
        interval = Math.min(2000, Math.max(500, interval * 2)); throttles++;
        await json(path.join(CACHE, "rate-limit.json"), { cooldown, interval });
        console.log(`HTTP ${response.status}: backoff chung ${Math.ceil((cooldown - Date.now()) / 1000)}s; giảm tốc`);
        await response.body?.cancel();
        continue;
      }
      const location = response.headers.get("location") ?? "";
      let body: unknown;
      const type = response.headers.get("content-type") ?? "";
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        if (/login|dang-nhap|pricing/.test(location)) return { data: null, type };
        stopped = true; await json(STOP, { observedAt: new Date().toISOString(), reason: "Source redirect/access restriction", status: response.status });
        throw new Error("SOURCE_STOPPED: unexpected redirect/access restriction");
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 20000000) throw new Error("Source response exceeds size budget");
      if (type.includes("json")) {
        try { body = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("Invalid source JSON"); }
      }
      const errorText = JSON.stringify(body ?? "");
      if (/account_banned|ip_banned/.test(errorText) || (response.status === 403 && !/vip|locked|authentication_required|login|premium/i.test(errorText))) {
        stopped = true; await json(STOP, { observedAt: new Date().toISOString(), reason: "Source access restriction", status: response.status });
        throw new Error("SOURCE_STOPPED: access restriction");
      }
      if ([401, 402, 403, 404, 410].includes(response.status)) return { data: null, type };
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${target.pathname}`);
      if (image) {
        if (!type.startsWith("image/") || bytes.length < 100) throw new Error("Invalid cover response");
        return { data: bytes, type };
      }
      if (!type.includes("json")) throw new Error("Source did not return JSON");
      return { data: body, type };
    }
    throw new Error("Source retry budget exhausted");
  } finally { const next = queue.shift(); if (next) next(); else active--; }
}
async function totals(db: PrismaClient, ids?: number[]) {
  const where = ids ? { idTruyen: { in: ids } } : {};
  const [stories, chapters, normal, vip, genres, authors] = await Promise.all([
    db.truyen.count({ where }), db.chuong.count({ where }), db.chuong.count({ where: { ...where, isFree: true } }),
    db.chuong.count({ where: { ...where, isFree: false, giaXu: { gt: 0 } } }), db.theLoai.count(), db.tacGiaDich.count(),
  ]);
  return { stories, chapters, normal, vip, genres, authors };
}
async function discover(db: PrismaClient): Promise<Manifest> {
  if (await exists(MANIFEST)) return manifestSchema.parse(JSON.parse(await readFile(MANIFEST, "utf8")));
  const pool: Book[] = [];
  // Reuse public discovery snapshots from inspection; every value is validated.
  for (let page = 0; page < 20; page++) {
    const file = path.join(CACHE, `discovery-${page}.json`);
    const rows = z.array(bookSchema).parse(await exists(file) ? JSON.parse(await readFile(file, "utf8")) : (await request(`${API}/discovery/feed?limit=30&offset=${page * 30}`)).data);
    await json(file, rows); pool.push(...rows);
    const old = await db.truyen.findMany({ select: { slug: true, tenTruyen: true } });
    const excluded = new Set(old.flatMap(b => [b.slug, key(b.tenTruyen)]));
    if (page >= 19 && chooseBooks(pool, excluded).length === 110) break;
    if (rows.length < 30) break;
  }
  const old = await db.truyen.findMany({ select: { slug: true, tenTruyen: true } });
  const chosen = chooseBooks(pool, new Set(old.flatMap(b => [b.slug, key(b.tenTruyen)])));
  if (chosen.length !== 110 || chosen.slice(0, 15).some(b => b.completionStatus !== "completed")) throw new Error("Insufficient unique books/15 completed novels");
  const result: Manifest = { version: 1, initial: await totals(db), entries: chosen.map(book => ({ book, done: false, saved: 0, skipped: [] })) };
  await json(MANIFEST, result);
  console.log(`Manifest: 110 truyện, ${chosen.filter(b => b.completionStatus === "completed").length} Full, ${chosen.reduce((n, b) => n + b.totalChapters, 0)} chương tham khảo`);
  return result;
}
async function catalogue(book: Book) {
  const file = path.join(CACHE, `chapters-${book.id}.json`);
  if (await exists(file)) return z.array(chapterSchema).parse(JSON.parse(await readFile(file, "utf8")));
  const refs: Chapter[] = [], seen = new Set<string>();
  for (let offset = 0; ; ) {
    const rows = z.array(chapterSchema).parse((await request(`${API}/novels/${book.slug}/chapters?limit=100&offset=${offset}`)).data);
    if (!rows.length) break;
    if (rows.some(row => seen.has(row.id))) throw new Error("Repeated catalogue page");
    for (const row of rows) { refs.push(row); seen.add(row.id); }
    offset += rows.length;
  }
  if (refs.length < book.totalChapters || new Set(refs.map(c => c.chapterNumber)).size !== refs.length) throw new Error("Incomplete or duplicate chapter catalogue");
  refs.sort((a, b) => a.chapterNumber - b.chapterNumber);
  await json(file, refs); return refs;
}
async function cover(book: Book) {
  if (!book.coverImageUrl) throw new Error("Source book has no cover");
  const base = `lohi-${createHash("sha256").update(book.coverImageUrl).digest("hex").slice(0, 24)}`;
  const types: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/avif": ".avif" };
  for (const ext of Object.values(types)) {
    const file = path.join(COVERS, base + ext);
    if (await exists(file) && (await stat(file)).size > 0) return `/uploads/covers/${base}${ext}`;
  }
  const response = await request(book.coverImageUrl, true);
  const ext = types[response.type.split(";")[0]];
  if (!ext || !Buffer.isBuffer(response.data)) throw new Error("Unsupported cover type");
  const file = path.join(COVERS, base + ext);
  await writeFile(file + ".tmp", response.data); await rename(file + ".tmp", file);
  return `/uploads/covers/${base}${ext}`;
}
export async function saveLohiChapter(db: PrismaClient, idTruyen: number, ref: Chapter, body: { title: string | null; content: string }) {
  return db.$transaction(async tx => {
    const old = await tx.chuong.findUnique({ where: { idTruyen_chuongSo: { idTruyen, chuongSo: ref.chapterNumber } }, select: { idChuong: true, isDeleted: true, noiDungChuong: { select: { noiDung: true } } } });
    if (old?.isDeleted) throw new Error("Refusing to restore deleted chapter");
    if (old?.noiDungChuong?.noiDung) return false;
    const slug = `chuong-${ref.chapterNumber}-lohi-${ref.id}`;
    const conflict = await tx.chuong.findUnique({ where: { idTruyen_slug: { idTruyen, slug } }, select: { idChuong: true } });
    if (conflict && conflict.idChuong !== old?.idChuong) throw new Error("Conflicting chapter slug");
    const row = old ?? await tx.chuong.create({ data: { idTruyen, chuongSo: ref.chapterNumber, slug, tieuDeChuong: text(body.title || ref.titleVi || `Chương ${ref.chapterNumber}`).slice(0, 300), isFree: true, giaXu: 0 }, select: { idChuong: true } });
    await tx.noiDungChuong.upsert({ where: { idChuong: row.idChuong }, create: { idChuong: row.idChuong, noiDung: body.content, contentType: "db" }, update: { noiDung: body.content, contentType: "db" } });
    return true;
  });
}

async function snapshot(db: PrismaClient) {
  // A one-time preservation snapshot, intentionally including old chapter bodies.
  return { schemaHash: createHash("sha256").update(await readFile(path.join(ROOT, "prisma/schema.prisma"))).digest("hex"),
    stories: await db.truyen.findMany({ orderBy: { idTruyen: "asc" } }),
    genres: await db.theLoai.findMany({ orderBy: { idTheLoai: "asc" } }),
    authors: await db.tacGiaDich.findMany({ orderBy: { idTacGiaDich: "asc" } }),
    chapters: await db.chuong.findMany({ orderBy: { idChuong: "asc" }, include: { noiDungChuong: true } }) };
}
export async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(a => !/^--limit=\d+$/.test(a))) throw new Error("Usage: crawl-lohi.ts --limit=3|110");
  const limit = Number(args[0]?.split("=")[1] ?? 110);
  if (!Number.isInteger(limit) || limit < 1 || limit > 110 || process.env.DATABASE_NAME !== "web_truyen") throw new Error("Invalid limit or database; require web_truyen");
  await mkdir(CACHE, { recursive: true }); await mkdir(COVERS, { recursive: true });
  const lockFile = path.join(CACHE, "run.lock");
  if (await exists(lockFile)) {
    const pid = Number(await readFile(lockFile, "utf8"));
    if (!Number.isInteger(pid) || pid < 1) throw new Error("Invalid run lock");
    try { process.kill(pid, 0); throw new Error("Crawler already running"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    await rm(lockFile);
  }
  const lock = await open(lockFile, "wx"); await lock.writeFile(String(process.pid));
  let db: PrismaClient | undefined;
  try {
    db = (await import("../lib/prisma")).prisma;
    const target = await db.$queryRaw<Array<{ db: string }>>`SELECT DATABASE() AS db`;
    if (target[0]?.db !== "web_truyen") throw new Error("Actual database is not web_truyen");
    console.log("Verified database: web_truyen; public requests only (no Cookie/Authorization)");
    stopped = await exists(STOP);
    if (stopped) throw new Error("SOURCE_STOPPED: persistent access restriction marker");
    const rateFile = path.join(CACHE, "rate-limit.json");
    if (await exists(rateFile)) {
      const rate = z.object({ cooldown: z.number(), interval: z.number().min(0).max(2000) }).parse(JSON.parse(await readFile(rateFile, "utf8")));
      cooldown = rate.cooldown; interval = Math.max(interval, rate.interval);
    }
    const baseline = path.join(CACHE, "baseline.json");
    if (!(await exists(baseline))) await json(baseline, await snapshot(db));
    const manifest = await discover(db);
    const genres = new NameRegistry(), authors = new NameRegistry();
    for (const g of await db.theLoai.findMany({ orderBy: { idTheLoai: "asc" }, select: { idTheLoai: true, tenTheLoai: true } })) genres.add(g.tenTheLoai, g.idTheLoai);
    for (const a of await db.tacGiaDich.findMany({ orderBy: { idTacGiaDich: "asc" }, select: { idTacGiaDich: true, ten: true } })) authors.add(a.ten, a.idTacGiaDich);
    const client = db;
    async function createStory(book: Book) {
      const image = await cover(book), tag = `source:lohi:${book.id}`;
      const prior = await client.truyen.findUnique({ where: { slug: book.slug }, select: { idTruyen: true, tag: true, isDeleted: true } });
      if (prior) {
        if (prior.tag !== tag || prior.isDeleted) throw new Error("Story slug already belongs to another import");
        return prior.idTruyen;
      }
      const createdGenres: Array<[string, number]> = [], createdAuthors: Array<[string, number]> = [];
      const id = await client.$transaction(async tx => {
        const acquired = await tx.$queryRaw<Array<{ ok: number }>>`SELECT GET_LOCK('web_truyen_crawl_metadata', 10) AS ok`;
        if (Number(acquired[0]?.ok) !== 1) throw new Error("Metadata lock unavailable");
        try {
          const story = await tx.truyen.create({ data: { tenTruyen: text(book.titleVi).slice(0, 255), slug: book.slug, tag, anhBia: image, anhThumbnail: image, moTa: cleanLohiText(book.synopsis || ""), trang_thai: book.completionStatus === "completed" ? "hoan_thanh" : "dang_tien_hanh", luotXem: Math.min(4294967295, Math.floor(book.readCount)), soChuong: 0 }, select: { idTruyen: true } });
          const ids = new Set<number>();
          for (const raw of book.genres) {
            const name = text(raw);
            let id = genres.get(name) ?? createdGenres.find(([n]) => key(n) === key(name))?.[1];
            if (!id) { id = (await tx.theLoai.create({ data: { tenTheLoai: name }, select: { idTheLoai: true } })).idTheLoai; createdGenres.push([name, id]); }
            ids.add(id);
          }
          for (const idTheLoai of ids) await tx.truyenTheLoai.create({ data: { idTruyen: story.idTruyen, idTheLoai } });
          const name = text(book.authorNameVi || book.authorVi || "");
          if (name) {
            let id = authors.get(name);
            if (!id) { id = (await tx.tacGiaDich.create({ data: { ten: name, loai: "tac_gia" }, select: { idTacGiaDich: true } })).idTacGiaDich; createdAuthors.push([name, id]); }
            await tx.truyen_tac_gia_dich.create({ data: { idTRUYEN: story.idTruyen, idTAC_GIA_DICH: id, vai_tro: "tac_gia_chinh" } });
          }
          return story.idTruyen;
        } finally { await tx.$queryRaw`SELECT RELEASE_LOCK('web_truyen_crawl_metadata')`; }
      }, { timeout: 15000 });
      for (const [name, id] of createdGenres) genres.add(name, id);
      for (const [name, id] of createdAuthors) authors.add(name, id);
      return id;
    }
    for (let i = 0; i < limit && !stopped; i++) {
      const entry = manifest.entries[i], book = entry.book;
      if (excludedContentTitle(book.titleVi)) throw new Error("Manifest contains an excluded explicit-content title; rebuild selection before continuing");
      const prefix = `[${i + 1}/${limit}] ${book.completionStatus === "completed" ? "[FULL] " : ""}${text(book.titleVi)}`;
      try {
        if (entry.localId) {
          const local = await client.truyen.findUnique({ where: { idTruyen: entry.localId }, select: { tag: true, isDeleted: true } });
          if (!local || local.isDeleted || local.tag !== `source:lohi:${book.id}`) throw new Error("Local mapping changed/deleted; refusing restore");
        }
        const stored = entry.localId ? await client.chuong.findMany({ where: { idTruyen: entry.localId, noiDungChuong: { noiDung: { not: "" } } }, select: { chuongSo: true } }) : [];
        const existing = new Set(stored.map(c => Number(c.chuongSo)));
        if (entry.done && existing.size === entry.saved && existing.size > 0) { console.log(`${prefix} — skip ${existing.size} chương đã đủ`); continue; }
        const refs = await catalogue(book), skipped = new Set(entry.skipped);
        let cursor = 0, failures = 0, added = 0;
        const errors: string[] = [];
        async function load(ref: Chapter) {
          if (existing.has(ref.chapterNumber) || skipped.has(ref.chapterNumber)) return null;
          if (ref.isVip || ref.isLocked || (book.vipFromChapter != null && ref.chapterNumber >= book.vipFromChapter)) { skipped.add(ref.chapterNumber); return null; }
          const response = await request(`${API}/chapters/${book.slug}/${ref.chapterNumber}`);
          const envelope = response.data == null ? null : z.object({ chapter: z.object({ titleVi: z.string().nullish(), content: z.string().nullish() }).passthrough().nullish() }).passthrough().parse(response.data);
          const body = envelope?.chapter ? publicBody(envelope.chapter) : null;
          if (!body) { skipped.add(ref.chapterNumber); return null; }
          return body;
        }
        // Find one readable chapter before creating metadata/cover for this book.
        if (!entry.localId) {
          while (cursor < refs.length && !stopped) {
            const ref = refs[cursor++], body = await load(ref);
            if (!body) continue;
            entry.localId = await createStory(book); await json(MANIFEST, manifest);
            if (await saveLohiChapter(client, entry.localId, ref, body)) added++;
            existing.add(ref.chapterNumber); break;
          }
        }
        if (entry.localId) {
          const id = entry.localId;
          await Promise.all(Array.from({ length: 5 }, async () => {
            while (cursor < refs.length && !stopped) {
              const ref = refs[cursor++];
              try {
                const body = await load(ref); if (!body) continue;
                if (await saveLohiChapter(client, id, ref, body)) added++;
                existing.add(ref.chapterNumber);
                if (added % 100 === 0) console.log(`${prefix} — +${added} chương...`);
              } catch (error) { failures++; if (errors.length < 3) errors.push(error instanceof Error ? error.message : "Chapter failure"); }
            }
          }));
          entry.saved = existing.size;
          await client.truyen.update({ where: { idTruyen: id }, data: { soChuong: entry.saved } });
        }
        entry.skipped = [...skipped].sort((a, b) => a - b); entry.done = !stopped && failures === 0; entry.error = errors.join("; ") || undefined;
        await json(MANIFEST, manifest);
        console.log(`${prefix} — ${entry.saved}/${refs.length} chương (+${added}; bỏ qua ${skipped.size} VIP/khóa/chưa dịch; lỗi ${failures})`);
      } catch (error) { entry.done = false; entry.error = error instanceof Error ? error.message : "Story failure"; await json(MANIFEST, manifest); console.log(`${prefix} — FAILED: ${entry.error}`); }
    }
    let vipStories = 0;
    for (const entry of manifest.entries.slice(0, limit)) {
      if (!entry.localId || entry.saved < 3 || vipStories >= 10 || !entry.done) continue;
      const tail = await client.chuong.findMany({ where: { idTruyen: entry.localId }, orderBy: { chuongSo: "desc" }, take: 3, select: { idChuong: true } });
      await client.chuong.updateMany({ where: { idChuong: { in: tail.map(c => c.idChuong) }, OR: [{ isFree: true }, { isFree: null }, { giaXu: { not: 5 } }] }, data: { isFree: false, giaXu: 5 } });
      vipStories++;
    }
    const ids = manifest.entries.slice(0, limit).flatMap(e => e.localId ? [e.localId] : []);
    const imported = await totals(client, ids), after = await totals(client);
    const full = await client.truyen.count({ where: { idTruyen: { in: ids }, trang_thai: "hoan_thanh" } });
    const report = { database: "web_truyen", finishedAt: new Date().toISOString(), limit, stopped, throttles, discovered: manifest.entries.length,
      imported: { stories: imported.stories, full, ongoing: imported.stories - full, chapters: imported.chapters, normal: imported.normal, vip: imported.vip, vipStories },
      initial: manifest.initial, after, newGenres: after.genres - manifest.initial.genres, newAuthors: after.authors - manifest.initial.authors,
      skipped: manifest.entries.slice(0, limit).reduce((n, e) => n + e.skipped.length, 0),
      errors: manifest.entries.slice(0, limit).filter(e => e.error).map(e => ({ slug: e.book.slug, error: e.error })) };
    await json(path.join(CACHE, `report-${limit}.json`), report);
    await json(path.join(ROOT, "scripts/crawl-lohi-results.json"), report);
    console.table({ imported: report.imported, database: after });
    if (stopped || ids.length < limit || report.errors.length || manifest.entries.slice(0, limit).some(e => !e.done)) process.exitCode = 2;
  } finally { await db?.$disconnect(); await lock.close(); await rm(lockFile, { force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error instanceof Error ? error.message : "Crawler failed"); process.exitCode = 1; });
