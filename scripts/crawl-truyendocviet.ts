/** node --import ./socket-server/node_modules/tsx/dist/loader.mjs scripts/crawl-truyendocviet.ts --limit=3|110 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { setDefaultResultOrder } from "node:dns";
import { access, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { PrismaClient } from "../app/generated/prisma/client";
import { normalizeVietnameseText } from "../lib/vietnamese-text";
import { cleanContent } from "./crawl-stories";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, "node_modules/.cache/crawl-truyendocviet");
const ORIGIN = "https://truyendocviet1.shop";
const MANIFEST = path.join(CACHE, "manifest.json");
const STOP_FILE = path.join(CACHE, "source-stopped.json");
const COVERS = path.join(ROOT, "public/uploads/covers");
const bookSchema = z.object({
  _id: z.coerce.string(), ContentTitle: z.string(), SeoUrl: z.string().regex(/^[\w-]+$/),
  Recap: z.string().nullish(), Thumbnail: z.string(), ChapterCount: z.number().int().nonnegative(),
  Note2: z.string().nullish(), IsVip: z.boolean(), SubCategories: z.array(z.number()),
  ListAuthors: z.array(z.object({ ContentTitle: z.string() })).default([]),
});
const categorySchema = z.object({ _id: z.number(), CategoryName: z.string(), SeoUrl: z.string() });
const chapterSchema = z.object({
  _id: z.coerce.string().regex(/^\d+$/), ContentTitle: z.string(), ContentOrder: z.number().nonnegative(),
  IsActive: z.boolean().optional(), IsVip: z.boolean().optional(), IsLocked: z.boolean().optional(),
  GuestTeaser: z.boolean().optional(), IsSecurityGate: z.boolean().optional(),
  BookId: z.coerce.string().optional(), Description: z.string().nullish(),
}).passthrough();
type Book = z.infer<typeof bookSchema>;
type Chapter = z.infer<typeof chapterSchema>;
const entrySchema = z.object({ book: bookSchema, group: z.string(), localId: z.number().optional(), done: z.boolean().optional(), saved: z.number().optional(), skipped: z.number().optional(), error: z.string().optional() });
const manifestSchema = z.object({ version: z.literal(1), categories: z.array(categorySchema), entries: z.array(entrySchema), initial: z.object({ genres: z.number(), stories: z.number(), chapters: z.number(), normal: z.number(), vip: z.number() }) });
type Manifest = z.infer<typeof manifestSchema>;

export const text = (value: string) => normalizeVietnameseText(value).replace(/\s+/g, " ").trim();
export function key(value: string) {
  return text(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
export function initialData(html: string): Record<string, unknown> {
  const raw = html.match(/window\.__INITIAL_DATA__\s*=\s*([^]*?)<\/script>/)?.[1].replace(/;\s*$/, "");
  if (!raw) throw new Error("Missing source initial data; markup changed");
  return z.record(z.string(), z.unknown()).parse(JSON.parse(raw));
}
export function cleanText(value: string) {
  return normalizeVietnameseText(cleanContent(value)).split("\n")
    .filter(line => !/(?:truyendocviet\d*\.(?:shop|com|net)|truyendocviet\.github\.io)/i.test(line))
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
export function chapterBody(html: string, bookId: string, chapterId: string) {
  const data = initialData(html);
  const page = z.record(z.string(), z.unknown()).parse(data.PageData);
  const chapter = chapterSchema.parse(page.chapterInfo);
  if (chapter._id !== chapterId || chapter.BookId !== bookId) throw new Error("Chapter identity mismatch");
  if (chapter.GuestTeaser || chapter.IsSecurityGate || chapter.IsVip || chapter.IsLocked || chapter.IsActive === false) return null;
  if (!chapter.Description) return null;
  const content = cleanText(chapter.Description);
  if (content.length < 100 || /(?:đăng nhập để (?:đọc|xem)|nâng cấp vip để|mua chương để)/i.test(content)) return null;
  return { chapter, content };
}

export class NameRegistry {
  private bySlug = new Map<string, number>();
  private byName = new Map<string, number>();
  add(name: string, id: number) {
    if (!this.bySlug.has(key(name))) this.bySlug.set(key(name), id);
    if (!this.byName.has(text(name).toLowerCase())) this.byName.set(text(name).toLowerCase(), id);
  }
  get(name: string) { return this.bySlug.get(key(name)) ?? this.byName.get(text(name).toLowerCase()); }
}

async function exists(file: string) {
  try { await access(file); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}
async function json(file: string, value: unknown) {
  await writeFile(`${file}.tmp`, JSON.stringify(value, null, 2) + "\n");
  await rename(`${file}.tmp`, file);
}
let active = 0;
const queue: Array<() => void> = [];
let stop = false;
let cooldown = 0;
async function request(url: string, body?: unknown): Promise<Response> {
  if (active >= 5) await new Promise<void>(resolve => queue.push(resolve));
  else active++;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (stop) throw new Error("SOURCE_STOPPED: source access restricted");
      await new Promise(resolve => setTimeout(resolve, 150 + Math.floor(Math.random() * 201)));
      while (Date.now() < cooldown) await new Promise(resolve => setTimeout(resolve, Math.min(60000, cooldown - Date.now())));
      if (stop) throw new Error("SOURCE_STOPPED: source access restricted");
      const target = new URL(url);
      if (target.protocol !== "https:" || ![new URL(ORIGIN).hostname, "div.gov.vn"].includes(target.hostname)) throw new Error("Unexpected request host");
      let response: Response;
      try {
        response = await fetch(url, { method: body ? "POST" : "GET", headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: "manual", signal: AbortSignal.timeout(30000) });
      } catch { if (attempt < 2) { await new Promise(resolve => setTimeout(resolve, 3000)); continue; } throw new Error(`Network timeout/failure at ${target.pathname}`); }
      if (response.status === 429 || response.status === 503) {
        const retry = response.headers.get("retry-after");
        const wait = retry && !Number.isNaN(Number(retry)) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : 0;
        cooldown = Math.max(cooldown, Date.now() + Math.max(3000, Number.isFinite(wait) ? wait : 0));
        await response.body?.cancel();
        if (attempt < 2) continue;
      }
      if (response.status === 403 || (response.status >= 300 && response.status < 400 && /banned|captcha|challenge|security-check/i.test(response.headers.get("location") ?? ""))) {
        stop = true; await response.body?.cancel();
        await json(STOP_FILE, { observedAt: new Date().toISOString(), reason: "Source security/access restriction; no bypass attempted" });
        throw new Error("SOURCE_STOPPED: access restriction; no bypass attempted");
      }
      if (response.status >= 300 && response.status < 400) {
        const redirect = response.headers.get("location");
        const destination = redirect ? new URL(redirect, url) : null;
        await response.body?.cancel();
        if (destination && /login|dang-nhap|vip|buy-book/.test(destination.pathname)) throw new Error("ACCESS_LOCKED: source requires login/payment");
        throw new Error(`HTTP ${response.status}: ${target.pathname} -> ${destination?.pathname ?? "unknown"}`);
      }
      if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}: ${target.pathname}`); }
      return response;
    }
    throw new Error("Retry budget exhausted");
  } finally {
    const next = queue.shift();
    if (next) next(); else active--;
  }
}
async function page(url: string) { return initialData(await (await request(url)).text()); }
async function stats(db: PrismaClient) {
  const [genres, stories, chapters, normal, vip] = await Promise.all([db.theLoai.count(), db.truyen.count(), db.chuong.count(), db.chuong.count({ where: { isFree: true } }), db.chuong.count({ where: { isFree: false, giaXu: { gt: 0 } } })]);
  return { genres, stories, chapters, normal, vip };
}

async function discover(db: PrismaClient): Promise<Manifest> {
  if (await exists(MANIFEST)) return manifestSchema.parse(JSON.parse(await readFile(MANIFEST, "utf8")));
  const home = await page(ORIGIN + "/");
  const categories = z.array(categorySchema).parse(home.Categories);
  const current = await db.truyen.findMany({ select: { slug: true, tenTruyen: true } });
  const excluded = new Set(current.flatMap(row => [row.slug, key(row.tenTruyen)]));
  const selected = new Map<string, z.infer<typeof entrySchema>>();
  function add(book: Book, group: string) {
    if (book.IsVip || !book.ChapterCount || selected.has(book._id) || excluded.has(book.SeoUrl) || excluded.has(key(book.ContentTitle))) return false;
    selected.set(book._id, { book, group }); excluded.add(book.SeoUrl); excluded.add(key(book.ContentTitle)); return true;
  }
  const fullPage = await page(`${ORIGIN}/truyen-mien-phi.html?status=full&vip=free`);
  const fullBooks = z.object({ arrBooks: z.object({ Results: z.array(bookSchema) }) }).parse(fullPage.PageData).arrBooks.Results;
  // Keep novels in the priority group; the source also lists classical non-fiction.
  for (const book of fullBooks.filter(b => b.Note2 === "FULL" && !b.SubCategories.some(id => [560, 557, 458, 456].includes(id))).slice(0, 30)) {
    add(book, "full-priority"); if (selected.size === 15) break;
  }
  if (selected.size < 15) throw new Error("Insufficient unique free Full novels in priority list");
  const genres = [434, 435, 438, 437, 450, 433, 446, 467, 441];
  const pools: Book[][] = [];
  for (const id of genres) {
    // Visit the category itself and then its public filter API (the HTML route's
    // vip query is ignored by the site; the actual filter API honors it).
    const category = categories.find(row => row._id === id);
    if (!category) throw new Error(`Missing requested source category ${id}`);
    await page(`${ORIGIN}/${category.SeoUrl}.html`);
    const payload = await (await request(`${ORIGIN}/api/v1/books/filter?sort=newest&page=1&pageSize=60&categoryIds=${id}&vip=free`)).json();
    const rows = z.object({ IsError: z.literal(false), Data: z.object({ Results: z.array(bookSchema) }) }).parse(payload).Data.Results;
    pools.push(rows);
  }
  for (let index = 0; selected.size < 110 && index < Math.max(...pools.map(rows => rows.length)); index++) {
    for (let genre = 0; genre < pools.length && selected.size < 110; genre++) {
      const book = pools[genre][index];
      if (book) add(book, `category-${genres[genre]}`);
    }
  }
  if (selected.size < 110) throw new Error(`Only ${selected.size} unique books discovered; need 110`);
  const manifest: Manifest = { version: 1, categories, entries: [...selected.values()], initial: await stats(db) };
  await json(MANIFEST, manifest);
  return manifest;
}

async function downloadCover(book: Book) {
  const url = new URL(book.Thumbnail, ORIGIN);
  const ext = path.extname(url.pathname).toLowerCase();
  if (![".jpg", ".jpeg", ".webp", ".png", ".avif"].includes(ext)) throw new Error("Unsupported cover extension");
  const name = `tdv-${createHash("sha256").update(url.href).digest("hex").slice(0, 24)}${ext}`;
  const file = path.join(COVERS, name);
  if (!(await exists(file)) || (await stat(file)).size === 0) {
    const response = await request(url.href);
    if (!response.headers.get("content-type")?.startsWith("image/")) throw new Error("Cover response is not an image");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 100 || bytes.length > 15000000) throw new Error("Invalid cover size");
    await writeFile(`${file}.tmp`, bytes); await rename(`${file}.tmp`, file);
  }
  return `/uploads/covers/${name}`;
}

async function catalogue(book: Book) {
  const refs: Chapter[] = [];
  const seen = new Set<string>();
  for (let current = 1; ; current++) {
    const response = await (await request(`${ORIGIN}/api/v1/chapters/listByBook`, { bookId: book._id, curPage: current, pageSize: 500, sortDir: "asc" })).json();
    const parsed = z.object({ IsError: z.literal(false), Results: z.array(chapterSchema) }).parse(response);
    if (!parsed.Results.length) break;
    let added = 0;
    for (const row of parsed.Results) if (!seen.has(row._id)) { refs.push(row); seen.add(row._id); added++; }
    if (!added) throw new Error("Repeated catalogue page; source pagination incomplete");
  }
  if (refs.length < book.ChapterCount) throw new Error(`Incomplete catalogue ${refs.length}/${book.ChapterCount}`);
  if (new Set(refs.map(ref => ref.ContentOrder)).size !== refs.length) throw new Error("Source catalogue repeats a chapter number; review before import");
  return refs.sort((a, b) => a.ContentOrder - b.ContentOrder);
}

export async function storeChapter(db: PrismaClient, id: number, chapter: Chapter, content: string) {
  const number = chapter.ContentOrder;
  if (number > 999999.9 || Math.round(number * 10) !== number * 10) throw new Error("Chapter order exceeds schema precision");
  const slug = `chuong-${number}-tdv-${chapter._id}`;
  return db.$transaction(async tx => {
    const old = await tx.chuong.findUnique({ where: { idTruyen_chuongSo: { idTruyen: id, chuongSo: number } }, select: { idChuong: true, isDeleted: true, noiDungChuong: { select: { noiDung: true } } } });
    if (old?.isDeleted) throw new Error("Existing chapter deleted locally; refusing restore");
    if (old?.noiDungChuong?.noiDung) return false;
    const conflict = await tx.chuong.findUnique({ where: { idTruyen_slug: { idTruyen: id, slug } }, select: { idChuong: true } });
    if (conflict && conflict.idChuong !== old?.idChuong) throw new Error("Conflicting chapter slug");
    const row = old ?? await tx.chuong.create({ data: { idTruyen: id, chuongSo: number, slug, tieuDeChuong: text(chapter.ContentTitle).slice(0, 300), isFree: true, giaXu: 0 }, select: { idChuong: true } });
    await tx.noiDungChuong.upsert({ where: { idChuong: row.idChuong }, create: { idChuong: row.idChuong, noiDung: normalizeVietnameseText(content), contentType: "db" }, update: { noiDung: normalizeVietnameseText(content), contentType: "db" } });
    return true;
  });
}

export async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => !/^--limit=\d+$/.test(arg))) throw new Error("Usage: crawl-truyendocviet.ts --limit=3|110");
  const limit = Number(args[0]?.split("=")[1] ?? 110);
  if (!Number.isInteger(limit) || limit < 1 || limit > 110) throw new Error("limit must be 1–110");
  if (process.env.DATABASE_NAME !== "web_truyen") throw new Error("DATABASE_NAME must be web_truyen");
  setDefaultResultOrder("ipv4first"); await mkdir(CACHE, { recursive: true }); await mkdir(COVERS, { recursive: true });
  const lockFile = path.join(CACHE, "run.lock");
  if (await exists(lockFile)) {
    const pid = Number(await readFile(lockFile, "utf8"));
    if (!Number.isInteger(pid) || pid < 1) throw new Error("Invalid crawler lock");
    try { process.kill(pid, 0); throw new Error("Crawler already running"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    await rm(lockFile);
  }
  const lock = await open(lockFile, "wx"); await lock.writeFile(String(process.pid));
  let db: PrismaClient | undefined;
  try {
    db = (await import("../lib/prisma")).prisma;
    const target = await db.$queryRaw<Array<{ db: string }>>`SELECT DATABASE() AS db`;
    if (target[0]?.db !== "web_truyen") throw new Error("Actual database is not web_truyen");
    // Cooperating writers share the DB advisory lock because metadata names have no UNIQUE.
    await db.$transaction(async tx => {
      const acquired = await tx.$queryRaw<Array<{ acquired: number }>>`SELECT GET_LOCK('web_truyen_crawl_metadata', 0) AS acquired`;
      if (Number(acquired[0]?.acquired) !== 1) throw new Error("Metadata crawler already holds DB lock");
      await tx.$queryRaw`SELECT RELEASE_LOCK('web_truyen_crawl_metadata')`;
    });
    console.log("Verified database: web_truyen");
    stop = await exists(STOP_FILE);
    if (stop && !(await exists(MANIFEST))) throw new Error("SOURCE_STOPPED: source access restricted; cannot discover a new manifest");
    const manifest = await discover(db);
    if (manifest.entries.length < limit) throw new Error("Manifest contains fewer stories than requested");
    const genres = new NameRegistry(), authors = new NameRegistry();
    // Metadata inventories are small, intentionally loaded for deduplication.
    for (const row of await db.theLoai.findMany({ orderBy: { idTheLoai: "asc" }, select: { idTheLoai: true, tenTheLoai: true } })) genres.add(row.tenTheLoai, row.idTheLoai);
    for (const row of await db.tacGiaDich.findMany({ orderBy: { idTacGiaDich: "asc" }, select: { idTacGiaDich: true, ten: true } })) authors.add(row.ten, row.idTacGiaDich);
    const client = db;
    for (let index = 0; index < limit; index++) {
      const entry = manifest.entries[index];
      if (stop) { console.log(`[${index + 1}/${limit}] ${text(entry.book.ContentTitle)} — chưa tải tiếp: nguồn yêu cầu security-check`); continue; }
      try {
        if (entry.done && entry.localId) {
          const count = await client.chuong.count({ where: { idTruyen: entry.localId, noiDungChuong: { noiDung: { not: "" } } } });
          if (count === entry.saved && count > 0) { console.log(`[${index + 1}/${limit}] ${entry.book.Note2 === "FULL" ? "[FULL] " : ""}${text(entry.book.ContentTitle)} — skip ${count} chương đã đủ`); continue; }
        }
        const detail = await page(`${ORIGIN}/doc-truyen/${entry.book.SeoUrl}.html`);
        const book = bookSchema.parse(detail.CurrentBook);
        if (book._id !== entry.book._id || book.IsVip) throw new Error("Story identity mismatch or source VIP book");
        const pageData = z.record(z.string(), z.unknown()).parse(detail.PageData);
        const refs = await catalogue(book);
        const image = await downloadCover(book);
        let local = entry.localId ? await client.truyen.findUnique({ where: { idTruyen: entry.localId }, select: { idTruyen: true, isDeleted: true, slug: true } }) : null;
        if (local?.isDeleted) throw new Error("Story deleted locally; refusing restore");
        if (!local) {
          const sourceTag = `source:truyendocviet:${book._id}`;
          const collision = await client.truyen.findUnique({ where: { slug: book.SeoUrl }, select: { idTruyen: true, isDeleted: true, slug: true, tag: true } });
          if (collision && (collision.tag !== sourceTag || collision.isDeleted)) throw new Error("Story slug already exists outside manifest mapping");
          if (collision) {
            local = collision;
            entry.localId = collision.idTruyen;
            await json(MANIFEST, manifest);
          }
          if (!local) {
          // Serialize metadata writes. Populate maps only after the transaction commits.
          const createdGenres: Array<[string, number]> = [], createdAuthors: Array<[string, number]> = [];
          local = await client.$transaction(async tx => {
            const acquired = await tx.$queryRaw<Array<{ acquired: number }>>`SELECT GET_LOCK('web_truyen_crawl_metadata', 10) AS acquired`;
            if (Number(acquired[0]?.acquired) !== 1) throw new Error("Metadata lock unavailable");
            try {
              const story = await tx.truyen.create({ data: { tenTruyen: text(book.ContentTitle).slice(0, 255), slug: book.SeoUrl, tag: sourceTag, anhBia: image, anhThumbnail: image, moTa: cleanText(book.Recap || ""), trang_thai: book.Note2 === "FULL" ? "hoan_thanh" : "dang_tien_hanh", luotXem: Math.min(4294967295, Math.max(0, Number(pageData.totalViews) || 0)), soChuong: 0 }, select: { idTruyen: true, isDeleted: true, slug: true } });
              const genreIds = new Set<number>();
              for (const categoryId of book.SubCategories) {
                const sourceGenre = manifest.categories.find(category => category._id === categoryId);
                if (!sourceGenre) throw new Error(`Unknown genre ${categoryId}`);
                const name = text(sourceGenre.CategoryName);
                let id = genres.get(name) ?? createdGenres.find(([pending]) => key(pending) === key(name))?.[1];
                if (!id) { id = (await tx.theLoai.create({ data: { tenTheLoai: name }, select: { idTheLoai: true } })).idTheLoai; createdGenres.push([name, id]); }
                genreIds.add(id);
              }
              for (const idTheLoai of genreIds) await tx.truyenTheLoai.create({ data: { idTruyen: story.idTruyen, idTheLoai } });
              const authorIds = new Set<number>();
              for (const author of book.ListAuthors) {
                const name = text(author.ContentTitle); if (!name) continue;
                let id = authors.get(name) ?? createdAuthors.find(([pending]) => key(pending) === key(name))?.[1];
                if (!id) { id = (await tx.tacGiaDich.create({ data: { ten: name, loai: "tac_gia" }, select: { idTacGiaDich: true } })).idTacGiaDich; createdAuthors.push([name, id]); }
                authorIds.add(id);
              }
              for (const id of authorIds) await tx.truyen_tac_gia_dich.create({ data: { idTRUYEN: story.idTruyen, idTAC_GIA_DICH: id, vai_tro: "tac_gia_chinh" } });
              return story;
            } finally { await tx.$queryRaw`SELECT RELEASE_LOCK('web_truyen_crawl_metadata')`; }
          }, { timeout: 15000 });
          for (const [name, id] of createdGenres) genres.add(name, id);
          for (const [name, id] of createdAuthors) authors.add(name, id);
          entry.localId = local.idTruyen;
          await json(MANIFEST, manifest);
          }
        }
        const localId = local.idTruyen;
        // Fetch chapter numbers only; resume checks must not load every body.
        const old = await client.chuong.findMany({ where: { idTruyen: localId, noiDungChuong: { noiDung: { not: "" } } }, select: { chuongSo: true } });
        const existing = new Set(old.map(row => Number(row.chuongSo)));
        let cursor = 0, skipped = 0, failed = 0;
        let guestBoundary = false;
        const errors: string[] = [];
        await Promise.all(Array.from({ length: 5 }, async () => {
          while (cursor < refs.length && !stop) {
            const ref = refs[cursor++];
            if (existing.has(ref.ContentOrder)) continue;
            // Public browser configuration explicitly caps guests at 20 chapters.
            // Apply that rule only after this book returns GuestTeaser beyond 20.
            if (guestBoundary && ref.ContentOrder > 20) { skipped++; continue; }
            if (ref.IsVip || ref.IsLocked || ref.IsSecurityGate || ref.IsActive === false) { skipped++; continue; }
            try {
              const html = await (await request(`${ORIGIN}/doc-truyen/${book.SeoUrl}/read/${ref._id}.html`)).text();
              const sourcePage = z.record(z.string(), z.unknown()).parse(initialData(html).PageData);
              const sourceChapter = chapterSchema.parse(sourcePage.chapterInfo);
              if (sourceChapter._id !== ref._id || sourceChapter.BookId !== book._id) throw new Error("Chapter identity mismatch");
              if (sourceChapter.GuestTeaser && sourceChapter.ContentOrder > 20) guestBoundary = true;
              const parsed = chapterBody(html, book._id, ref._id);
              if (!parsed) { skipped++; continue; }
              if (parsed.chapter.ContentOrder !== ref.ContentOrder) throw new Error("Chapter order mismatch");
              await storeChapter(client, localId, parsed.chapter, parsed.content); existing.add(ref.ContentOrder);
            } catch (error) {
              const reason = error instanceof Error ? error.message : "Chapter failure";
              if (reason.startsWith("ACCESS_LOCKED")) { skipped++; if (ref.ContentOrder > 20) guestBoundary = true; }
              else { failed++; if (errors.length < 5) errors.push(reason); }
            }
          }
        }));
        entry.saved = await client.chuong.count({ where: { idTruyen: localId, noiDungChuong: { noiDung: { not: "" } } } });
        await client.truyen.update({ where: { idTruyen: localId }, data: { soChuong: entry.saved } });
        entry.skipped = skipped; entry.done = !stop && failed === 0; entry.error = errors.join("; ") || undefined;
        await json(MANIFEST, manifest);
        console.log(`[${index + 1}/${limit}] ${book.Note2 === "FULL" ? "[FULL] " : ""}${text(book.ContentTitle)} — Đã lưu ${entry.saved}/${refs.length} chương (bỏ qua ${skipped} chương VIP/khóa/xem thử; lỗi ${failed})`);
      } catch (error) { entry.error = error instanceof Error ? error.message : "Story failure"; entry.done = false; await json(MANIFEST, manifest); console.log(`[${index + 1}/${limit}] FAILED ${text(entry.book.ContentTitle)}: ${entry.error}`); }
    }
    const vipStories: number[] = [];
    for (const entry of manifest.entries.slice(0, limit)) {
      if (!entry.localId || (entry.saved ?? 0) < 3 || vipStories.length === 10) continue;
      const tail = await client.chuong.findMany({ where: { idTruyen: entry.localId }, orderBy: { chuongSo: "desc" }, take: 3, select: { idChuong: true } });
      await client.chuong.updateMany({ where: { idChuong: { in: tail.map(row => row.idChuong) }, OR: [{ isFree: true }, { isFree: null }, { giaXu: { not: 5 } }] }, data: { isFree: false, giaXu: 5 } });
      vipStories.push(entry.localId);
    }
    const ids = manifest.entries.slice(0, limit).flatMap(entry => entry.localId ? [entry.localId] : []);
    const [full, ongoing, normal, vip, chapters] = await Promise.all([
      client.truyen.count({ where: { idTruyen: { in: ids }, trang_thai: "hoan_thanh" } }),
      client.truyen.count({ where: { idTruyen: { in: ids }, trang_thai: "dang_tien_hanh" } }),
      client.chuong.count({ where: { idTruyen: { in: ids }, isFree: true } }),
      client.chuong.count({ where: { idTruyen: { in: ids }, isFree: false, giaXu: 5 } }),
      client.chuong.count({ where: { idTruyen: { in: ids } } }),
    ]);
    const after = await stats(client);
    const report = { database: "web_truyen", finishedAt: new Date().toISOString(), limit, sourceStopped: stop, sourceRestriction: stop ? "security-check/access restriction; remaining network requests were not attempted" : null, discovered: { stories: manifest.entries.length, fullPriority: manifest.entries.filter(entry => entry.group === "full-priority").length, full: manifest.entries.filter(entry => entry.book.Note2 === "FULL").length, ongoing: manifest.entries.filter(entry => entry.book.Note2 !== "FULL").length }, imported: { full, ongoing, normal, vip, chapters, stories: ids.length, vipStories: vipStories.length }, initial: manifest.initial, after, newGenres: after.genres - manifest.initial.genres, errors: manifest.entries.slice(0, limit).filter(entry => entry.error).map(entry => ({ slug: entry.book.SeoUrl, error: entry.error })) };
    await json(path.join(CACHE, `report-${limit}.json`), report);
    await json(path.join(ROOT, "scripts/crawl-truyendocviet-results.json"), report);
    console.table({ imported: report.imported, database: after });
    if (stop || ids.length < limit || report.errors.length || manifest.entries.slice(0, limit).some(entry => !entry.done)) process.exitCode = 2;
  } finally { await db?.$disconnect(); await lock.close(); await rm(lockFile, { force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error instanceof Error ? error.message : "Crawler failed"); process.exitCode = 1; });
