/**
 * node --import ./socket-server/node_modules/tsx/dist/loader.mjs scripts/crawl-stories.ts --limit=2
 * Repeat with --limit=50. Manifest/reports: node_modules/.cache/crawl-stories/.
 * Uses the authorized source session from .env; never purchases or unlocks chapters.
 */
import "dotenv/config";
import { access, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { setDefaultResultOrder } from "node:dns";
import { z } from "zod";
import type { PrismaClient } from "../app/generated/prisma/client";
import { encryptSource, decryptSource, normalizeVietnamese } from "./crawl-source-codec";

const ORIGIN = "https://lacatruyen.email";
const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, "node_modules/.cache/crawl-stories");
const MANIFEST = path.join(CACHE, "manifest.json");
const SOURCE_STOP = path.join(CACHE, "source-stopped.json");
const PUBLIC_SOURCE_STOP = path.join(CACHE, "public-source-stopped.json");
let sourceStopped = false;
let guestMode = false;
let userAgentIndex = 0;
let cooldownUntil = 0;
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0",
];
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  Accept: "text/html,application/json,image/webp,*/*;q=0.8",
};
const chapterRef = z.object({ id: z.number(), title: z.string(), slug: z.string(), chapter_order: z.number() });
const storySchema = z.object({
  id: z.number(), title: z.string().min(1).max(255), slug: z.string().min(1).max(300),
  image: z.string(), description: z.string().nullish(), detail: z.string().nullish(),
  author: z.string().nullish(), name_user: z.string().nullish(), pen_name_user: z.string().nullish(),
  status: z.string(), view: z.coerce.number().int().nonnegative().default(0),
});
const detailSchema = z.object({
  storyExists: z.boolean(), story: storySchema,
  categories: z.array(z.object({ category_title: z.string().min(1).max(100) })),
  firstChapter: z.array(chapterRef),
});
const manifestSchema = z.object({
  version: z.literal(1), createdAt: z.string(),
  stories: z.array(z.object({ slug: z.string(), url: z.string().url(), sourceList: z.string() })),
});
type StoryDetail = z.infer<typeof detailSchema>;
type Result = { slug: string; id?: number; status: string; chapters: number; blocked: number; errors: string[]; listed?: number; added?: number; existing?: number; pages?: number; sourceLock?: string };

export function decodeEntities(text: string): string {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»" };
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (all, key: string) => {
    if (!key.startsWith("#")) return entities[key.toLowerCase()] ?? all;
    const value = key[1].toLowerCase() === "x" ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : "";
  });
}

export function cleanContent(html: string): string {
  // Strip active/advertising/hidden markup BEFORE decoding entities. Never execute source HTML.
  let value = html.replace(/<!--[^]*?-->/g, "");
  for (let pass = 0; pass < 4; pass++) {
    value = value.replace(/<(script|style|noscript|iframe|ins|aside|button|nav|form)\b[^>]*>[^]*?<\/\1\s*>/gi, "")
      .replace(/<([a-z][\w-]*)\b[^>]*(?:class\s*=\s*["'][^"']*\b(?:adsbygoogle|advertisement|watermark|ads-banner)\b[^"']*["']|\bhidden\b|style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^"']*["'])[^>]*>[^]*?<\/\1\s*>/gi, "");
  }
  value = value.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/(?:p|div|h[1-6]|li|section)>/gi, "\n\n").replace(/<[^>]+>/g, "");
  return normalizeVietnamese(decodeEntities(value).replace(/[\u200b-\u200d\ufeff]/g, "").split(/\r?\n/)
    .map(line => line.replace(/[\t \u00a0]+/g, " ").trim())
    .filter(line => !/^(?:nguồn\s*[:：].*(?:lacatruyen|metruyen)|(?:đọc|doc) truyện (?:tại|tai)\s+https?:|(?:truyện được đăng tại|vui lòng không sao chép)|https?:\/\/(?:www\.)?(?:lacatruyen|metruyen)\.)/i.test(line))
    .join("\n").replace(/\n{3,}/g, "\n\n").trim()).normalize("NFC");
}

export function originalCoverUrl(raw: string): string {
  let url = new URL(decodeEntities(raw), ORIGIN);
  for (let depth = 0; depth < 4 && url.pathname === "/_next/image"; depth++) {
    const inner = url.searchParams.get("url");
    if (!inner) throw new Error("Image optimizer URL missing url parameter");
    url = new URL(inner, url.origin);
  }
  if (url.protocol !== "https:" || !["lacatruyen.email", "cms.metruyen.com"].includes(url.hostname)) throw new Error("Unexpected cover host");
  return url.href;
}

export function chapterNumber(title: string, fallback: number): number {
  const match = normalizeVietnamese(title).match(/(?:chương|chuong)\s*(\d+(?:[.,]\d)?)(?!\d)/i);
  const number = match ? Number(match[1].replace(",", ".")) : fallback;
  if (!Number.isFinite(number) || number < 0 || number > 999999.9) throw new Error("Invalid chapter number");
  return number;
}

export function nextData(html: string): unknown {
  const data = html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([^]*?)<\/script>/i)?.[1];
  if (!data) throw new Error("Missing __NEXT_DATA__; source markup changed");
  return JSON.parse(data);
}

const pageEnvelope = z.object({ props: z.object({ pageProps: z.record(z.string(), z.unknown()) }) });
function props(html: string) { return pageEnvelope.parse(nextData(html)).props.pageProps; }
export function message(error: unknown) {
  let value = error instanceof Error ? error.message : String(error);
  for (const secret of [process.env.CRAWL_SOURCE_COOKIE, process.env.CRAWL_SOURCE_TOKEN,
    process.env.CRAWL_SOURCE_TOKEN?.replace(/^Bearer\s+/i, ""), process.env.CRAWL_SOURCE_COOKIE?.replace(/^token=/, "")]) {
    if (secret) value = value.split(secret).join("[REDACTED]");
  }
  return value.replace(/Bearer\s+[^\s"'<>]+/gi, "Bearer [REDACTED]").replace(/token=[^;\s"'<>]+/gi, "token=[REDACTED]");
}
async function exists(file: string) { try { await access(file); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; } }
async function atomicJson(file: string, data: unknown) {
  await writeFile(`${file}.tmp`, JSON.stringify(data, null, 2), "utf8");
  await rename(`${file}.tmp`, file);
}

export function sourceHeaders(url: string, publicOnly = guestMode): Record<string, string> {
  const headers: Record<string, string> = { ...HEADERS };
  if (publicOnly) headers["User-Agent"] = USER_AGENTS[userAgentIndex++ % USER_AGENTS.length];
  if (!publicOnly && new URL(url).origin === ORIGIN) {
    if (process.env.CRAWL_SOURCE_COOKIE?.trim()) headers.Cookie = process.env.CRAWL_SOURCE_COOKIE.trim();
    if (process.env.CRAWL_SOURCE_TOKEN?.trim()) headers.Authorization = process.env.CRAWL_SOURCE_TOKEN.trim();
  }
  return headers;
}

export function sourceRedirectBlocked(url: string, response: Response): boolean {
  if (response.status < 300 || response.status >= 400) return false;
  const location = response.headers.get("location");
  if (!location) return true;
  const target = new URL(location, url);
  return target.origin !== ORIGIN || /^\/(?:banned|login|auth)(?:\/|$)/.test(target.pathname);
}

async function request(url: string, body?: Record<string, string>): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (sourceStopped) throw new Error("SOURCE_STOPPED: no further source requests");
    const delay = guestMode ? 150 + Math.floor(Math.random() * 201) : 400 + Math.floor(Math.random() * 401);
    await new Promise(resolve => setTimeout(resolve, delay));
    while (Date.now() < cooldownUntil) await new Promise(resolve => setTimeout(resolve, Math.min(60000, cooldownUntil - Date.now())));
    if (sourceStopped) throw new Error("SOURCE_STOPPED: no further source requests");
    const headers = sourceHeaders(url);
    if (body) headers["Content-Type"] = "application/json";
    const response = await fetch(url, { headers, method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000), redirect: "manual" });
    const target = response.headers.get("location");
    const restrictedRedirect = sourceRedirectBlocked(url, response);
    const banned = restrictedRedirect && target && new URL(target, url).pathname.startsWith("/banned");
    if (banned || (!guestMode && (restrictedRedirect || response.status === 401 || response.status === 403))) {
      sourceStopped = true;
      await response.body?.cancel();
      await atomicJson(guestMode ? PUBLIC_SOURCE_STOP : SOURCE_STOP, { detectedAt: new Date().toISOString(), reason: "Source denied access; redirect not followed" });
      throw new Error("SOURCE_STOPPED: source denied access; redirect not followed");
    }
    if (guestMode && (restrictedRedirect || response.status === 401 || response.status === 403)) {
      await response.body?.cancel();
      throw new Error("ACCESS_BLOCKED: public access requires authentication");
    }
    if (response.status === 429 || response.status === 503) {
      cooldownUntil = Math.max(cooldownUntil, Date.now() + retryDelay(response.headers.get("retry-after")));
      await response.body?.cancel();
      if (attempt < 2) continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status} at ${new URL(url).pathname}`);
    return response;
  }
  throw new Error("Source retry budget exhausted");
}

export function retryDelay(retryAfter: string | null, now = Date.now()): number {
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  const requested = Number.isFinite(seconds) ? seconds * 1000 : retryAfter ? Date.parse(retryAfter) - now : 0;
  return Math.max(3000, Number.isFinite(requested) ? requested : 0);
}

export function publicChapter(html: string) {
  const data = props(html);
  const story = z.object({ id: z.number(), lock: z.string().nullish() }).passthrough().parse(data.story);
  if (story.lock === "login" || story.lock === "all") throw new Error(`ACCESS_BLOCKED: story lock=${story.lock}`);
  if (data.notify && data.notify !== "success") throw new Error(`ACCESS_BLOCKED: ${String(data.notify)} (lock=${story.lock ?? "none"})`);
  const chapter = z.object({ title: z.string(), slug: z.string(), chapter_order: z.coerce.number(), content: z.string(), fee: z.coerce.number().default(0) }).parse(data.chapter);
  if (chapter.fee > 0) throw new Error("ACCESS_BLOCKED: paid source chapter");
  if (chapter.content.startsWith("U2FsdGVkX1")) throw new Error("ACCESS_BLOCKED: source returned encrypted content, no plaintext available");
  const content = cleanContent(chapter.content);
  if (content.length < 200 || /(?:đăng nhập để đọc|mua chương để đọc)/i.test(content)) throw new Error("Incomplete or restricted chapter body");
  return { storyId: story.id, chapter: { ...chapter, title: normalizeVietnamese(chapter.title) }, content, next: data.chapterRight ? chapterRef.parse(data.chapterRight) : null };
}

export function authenticatedChapter(html: string) {
  const data = props(html);
  const story = z.object({ id: z.number(), lock: z.string().nullish() }).parse(data.story);
  if (story.lock === "all") throw new Error("ACCESS_BLOCKED: lock=all; skipped without unlocking");
  if (data.notify !== "success") throw new Error("ACCESS_BLOCKED: source did not authorize this chapter");
  const encrypted = z.record(z.string(), z.string()).parse(data.chapter);
  const rs = z.record(z.string(), z.string()).parse(data.rs);
  const index = decryptSource(z.string().parse(data.ri));
  // Match the browser's string coercion exactly, including missing rs[index].
  // The server has already granted access via notify=success above.
  const selected: string | undefined = rs[index] ? decryptSource(rs[index]) : undefined;
  const comments = Array.isArray(data.comment_count) ? data.comment_count.toString() : String(data.comment_count);
  const key = `${selected}${comments}`;
  const fields = Object.fromEntries(Object.entries(encrypted).map(([name, value]) => [name, decryptSource(value, key)]));
  const chapter = z.object({ id: z.coerce.number().int(), id_story: z.coerce.number().int(), title: z.string().min(1).max(300), slug: z.string().min(1), chapter_order: z.coerce.number().nonnegative(), fee: z.coerce.number().nonnegative() }).parse(fields);
  if (chapter.fee > 0) throw new Error("ACCESS_BLOCKED: paid source chapter; skipped without purchase");
  const contentKey = decryptSource(z.string().parse(fields.key_encrypt), key);
  const raw = decryptSource(fields.content || z.string().parse(data.contentEncrypt), contentKey);
  const content = cleanContent(raw);
  if (content.length < 200 || /(?:đăng nhập để đọc|mua chương để đọc)/i.test(content)) throw new Error("Incomplete or restricted chapter body");
  return { storyId: story.id, chapter: { ...chapter, title: normalizeVietnamese(chapter.title) }, content };
}

export function orderedChapterList(value: unknown) {
  // chapter_order may be an offset inherited from another source (e.g. 775
  // for a row explicitly titled Chương 1). The displayed chapter number wins.
  const rows = z.array(chapterRef).parse(value).filter(row => chapterNumber(row.title, row.chapter_order) >= 1)
    .sort((a, b) => chapterNumber(a.title, a.chapter_order) - chapterNumber(b.title, b.chapter_order));
  const seen = new Set<number>();
  const slugs = new Set<string>();
  const selected = rows.filter(row => {
    const number = chapterNumber(row.title, row.chapter_order);
    if (seen.has(number) || slugs.has(row.slug)) return false;
    seen.add(number); slugs.add(row.slug); return true;
  }).slice(0, 15);
  if (!selected.length || chapterNumber(selected[0].title, selected[0].chapter_order) !== 1) throw new Error("Source list does not start at chapter 1");
  return selected;
}

async function firstChapters(sourceId: number) {
  const response = await request(`${ORIGIN}/api/chapters/list-chapters`, {
    id_story: encryptSource(String(sourceId)), page: encryptSource("1"),
    items_per_page: encryptSource("15"), order: encryptSource("ASC"),
  });
  const payload = z.object({ data: z.string() }).parse(await response.json());
  return orderedChapterList(JSON.parse(decryptSource(payload.data)));
}

export async function* walkChapterPages(loadPage: (page: number) => Promise<unknown>) {
  const seen = new Set<number>();
  for (let page = 1; ; page++) {
    const rows = z.array(chapterRef).parse(await loadPage(page));
    if (!rows.length) return;
    const unique = rows.filter(row => {
      if (seen.has(row.id)) return false;
      seen.add(row.id); return true;
    });
    if (!unique.length) throw new Error("Source pagination repeated a page; catalogue is incomplete");
    yield unique.map(row => ({ ...row, title: normalizeVietnamese(row.title) }));
  }
}

export function guestChapter(html: string) {
  const data = props(html);
  const story = z.object({ id: z.number(), lock: z.string().nullish() }).parse(data.story);
  if (story.lock === "login" || story.lock === "all") throw new Error(`ACCESS_BLOCKED: story lock=${story.lock}`);
  if (data.notify && data.notify !== "success") throw new Error("ACCESS_BLOCKED: no public full text");
  const content = z.object({ content: z.string() }).parse(data.chapter).content;
  return content.startsWith("U2FsdGVkX1") ? authenticatedChapter(html) : publicChapter(html);
}

async function allPublicChapters(db: PrismaClient, storyId: number, detail: StoryDetail, result: Result) {
  const old = await db.chuong.findMany({ where: { idTruyen: storyId }, select: { chuongSo: true, isDeleted: true, noiDungChuong: { select: { noiDung: true } } } });
  const existing = new Map(old.map(row => [Number(row.chuongSo), { isDeleted: row.isDeleted, content: row.noiDungChuong?.noiDung }]));
  result.added = 0; result.listed = 0; result.existing = 0; result.pages = 0;
  // story.lock is a story-wide access rule. Once observed, still enumerate the
  // full catalogue, but skip bodies covered by that rule without more requests.
  let storyLock: string | undefined;
  const pages = walkChapterPages(async page => {
    const response = await request(`${ORIGIN}/api/chapters/list-chapters`, {
      id_story: encryptSource(String(detail.story.id)), page: encryptSource(String(page)),
      items_per_page: encryptSource("500"), order: encryptSource("ASC"),
    });
    const payload = z.object({ data: z.string() }).parse(await response.json());
    return JSON.parse(decryptSource(payload.data));
  });
  for await (const refs of pages) {
    result.pages++;
    const persistRefs: Array<z.infer<typeof chapterRef>> = [];
    for (const ref of refs) {
      result.listed++;
      persistRefs.push(ref);
      const number = chapterNumber(ref.title, ref.chapter_order);
      const previous = existing.get(number);
      if (previous?.isDeleted || previous?.content?.trim()) { result.existing++; continue; }
      if (storyLock) { result.blocked++; continue; }
      if (sourceStopped) throw new Error("SOURCE_STOPPED: public collection stopped");
      try {
        const html = await (await request(`${ORIGIN}/chapter/${encodeURIComponent(ref.slug)}`)).text();
        const data = props(html);
        const story = z.object({ id: z.number(), lock: z.string().nullish() }).parse(data.story);
        if (story.id !== detail.story.id) throw new Error("Source chapter belongs to another story");
        if (story.lock === "login" || story.lock === "all") {
          storyLock = story.lock; result.sourceLock = storyLock; result.blocked++; continue;
        }
        const parsed = guestChapter(html);
        if (parsed.storyId !== detail.story.id || parsed.chapter.slug !== ref.slug || parsed.chapter.chapter_order !== ref.chapter_order || chapterNumber(parsed.chapter.title, parsed.chapter.chapter_order) !== number) throw new Error("Source chapter identity/order mismatch");
        if (await saveChapter(db, storyId, { ...ref, title: parsed.chapter.title }, parsed.content)) result.added++;
        existing.set(number, { isDeleted: false, content: parsed.content });
      } catch (error) {
        const reason = message(error);
        if (reason.startsWith("ACCESS_BLOCKED") || reason.includes("Incomplete or restricted")) result.blocked++;
        else result.errors.push(`chapter ${number}: ${reason}`);
        if (sourceStopped) throw error;
      }
    }
    // This cache contains public metadata only, never tokens or chapter bodies.
    const directory = path.join(CACHE, "public-catalogue", result.slug);
    await mkdir(directory, { recursive: true });
    await atomicJson(path.join(directory, `page-${result.pages}.json`), persistRefs);
  }
  result.chapters = await db.chuong.count({ where: { idTruyen: storyId, isDeleted: false, noiDungChuong: { noiDung: { not: "" } } } });
  await db.truyen.update({ where: { idTruyen: storyId }, data: { soChuong: result.chapters } });
}

export async function normalizeStoredText(db: PrismaClient) {
  const changes = { stories: 0, chapterTitles: 0, chapterBodies: 0 };
  let storyCursor = 0;
  for (;;) {
    const rows = await db.truyen.findMany({ where: { idTruyen: { gt: storyCursor } }, orderBy: { idTruyen: "asc" }, take: 100, select: { idTruyen: true, tenTruyen: true, moTa: true, tag: true } });
    if (!rows.length) break;
    for (const row of rows) {
      const data = { tenTruyen: normalizeVietnamese(row.tenTruyen), moTa: row.moTa === null ? null : normalizeVietnamese(row.moTa), tag: row.tag === null ? null : normalizeVietnamese(row.tag) };
      if (data.tenTruyen !== row.tenTruyen || data.moTa !== row.moTa || data.tag !== row.tag) { await db.truyen.update({ where: { idTruyen: row.idTruyen }, data }); changes.stories++; }
    }
    storyCursor = rows[rows.length - 1].idTruyen;
  }
  let chapterCursor = 0;
  for (;;) {
    const rows = await db.chuong.findMany({ where: { idChuong: { gt: chapterCursor } }, orderBy: { idChuong: "asc" }, take: 50, select: { idChuong: true, tieuDeChuong: true, noiDungChuong: { select: { noiDung: true } } } });
    if (!rows.length) break;
    for (const row of rows) {
      const title = normalizeVietnamese(row.tieuDeChuong);
      const content = row.noiDungChuong?.noiDung;
      const text = content == null ? content : normalizeVietnamese(content);
      if (title === row.tieuDeChuong && text === content) continue;
      await db.$transaction(async tx => {
        if (title !== row.tieuDeChuong) await tx.chuong.update({ where: { idChuong: row.idChuong }, data: { tieuDeChuong: title } });
        if (text !== content) await tx.noiDungChuong.update({ where: { idChuong: row.idChuong }, data: { noiDung: text } });
      });
      if (title !== row.tieuDeChuong) changes.chapterTitles++;
      if (text !== content) changes.chapterBodies++;
    }
    chapterCursor = rows[rows.length - 1].idChuong;
  }
  return changes;
}

export async function saveChapter(db: PrismaClient, storyId: number, ref: z.infer<typeof chapterRef>, content: string) {
  const number = chapterNumber(ref.title, ref.chapter_order);
  // Number prefix makes duplicate source titles/slugs distinct inside this story.
  const slug = `chuong-${number}-${ref.slug}`.slice(0, 300);
  return db.$transaction(async tx => {
    const existing = await tx.chuong.findUnique({ where: { idTruyen_chuongSo: { idTruyen: storyId, chuongSo: number } }, select: { idChuong: true, isDeleted: true, noiDungChuong: { select: { noiDung: true } } } });
    if (existing?.isDeleted) throw new Error("Chapter is deleted; refusing to restore it");
    if (existing?.noiDungChuong?.noiDung?.trim()) return false;
    const collision = await tx.chuong.findUnique({ where: { idTruyen_slug: { idTruyen: storyId, slug } }, select: { idChuong: true } });
    if (collision && collision.idChuong !== existing?.idChuong) throw new Error("Chapter slug conflicts with another chapter number");
    const chapter = existing ?? await tx.chuong.create({ data: { idTruyen: storyId, chuongSo: number, slug, tieuDeChuong: normalizeVietnamese(ref.title).normalize("NFC"), isFree: true, giaXu: 0 }, select: { idChuong: true } });
    const text = normalizeVietnamese(content).normalize("NFC");
    await tx.noiDungChuong.upsert({ where: { idChuong: chapter.idChuong }, create: { idChuong: chapter.idChuong, noiDung: text, contentType: "db" }, update: { noiDung: text, contentType: "db" } });
    return true;
  });
}

async function chapters(db: PrismaClient, storyId: number, detail: StoryDetail, result: Result) {
  const refs = await firstChapters(detail.story.id);
  for (const ref of refs) {
    const number = chapterNumber(ref.title, ref.chapter_order);
    const existing = await db.chuong.findUnique({ where: { idTruyen_chuongSo: { idTruyen: storyId, chuongSo: number } }, select: { isDeleted: true, noiDungChuong: { select: { noiDung: true } } } });
    if (existing?.isDeleted) { result.errors.push(`chapter ${ref.chapter_order}: deleted locally; skipped`); continue; }
    if (existing?.noiDungChuong?.noiDung?.trim()) { result.chapters++; continue; }
    try {
      const parsed = authenticatedChapter(await (await request(`${ORIGIN}/chapter/${encodeURIComponent(ref.slug)}`)).text());
      if (parsed.storyId !== detail.story.id || parsed.chapter.id_story !== detail.story.id || parsed.chapter.id !== ref.id || parsed.chapter.slug !== ref.slug || parsed.chapter.chapter_order !== ref.chapter_order || chapterNumber(parsed.chapter.title, parsed.chapter.chapter_order) !== number) throw new Error("Source chapter identity/order mismatch");
      await saveChapter(db, storyId, { ...ref, title: parsed.chapter.title }, parsed.content);
      result.chapters++;
    } catch (error) {
      const reason = message(error);
      result.errors.push(`chapter ${ref.chapter_order}: ${reason}`);
      if (reason.startsWith("ACCESS_BLOCKED")) result.blocked++;
      console.log(`  SKIP ${result.slug} chapter ${ref.chapter_order}: ${reason}`);
      if (sourceStopped) break;
    }
  }
  const count = await db.chuong.count({ where: { idTruyen: storyId, isDeleted: false, noiDungChuong: { noiDung: { not: "" } } } });
  await db.truyen.update({ where: { idTruyen: storyId }, data: { soChuong: count } });
}

async function totals(db: PrismaClient, ids?: number[]) {
  const scope = ids ? { idTruyen: { in: ids } } : {};
  const [genres, authors, stories, normal, vip, comments, ratings] = await Promise.all([
    db.theLoai.count({ where: ids ? { truyenTheLoai: { some: scope } } : {} }),
    db.tacGiaDich.count({ where: ids ? { truyen_tac_gia_dich: { some: { idTRUYEN: { in: ids } } } } : {} }),
    db.truyen.count({ where: scope }), db.chuong.count({ where: { ...scope, isFree: true } }),
    db.chuong.count({ where: { ...scope, isFree: false, giaXu: { gt: 0 } } }),
    db.binhLuan.count({ where: ids ? { idTRUYEN: { in: ids } } : {} }), db.danhGiaTruyen.count({ where: scope }),
  ]);
  return { genres, authors, stories, normal, vip, comments, ratings };
}

export async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !/^--limit=\d+$/.test(arg) && arg !== "--finalize-local" && arg !== "--all-chapters")) throw new Error("Usage: crawl-stories.ts --limit=2|50 [--all-chapters] [--finalize-local]");
  const localOnly = args.includes("--finalize-local");
  const allChapters = args.includes("--all-chapters");
  guestMode = allChapters;
  const limit = Number(args.find(arg => arg.startsWith("--limit="))?.split("=")[1] ?? 50);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("limit must be 1–50");
  if (!localOnly && !guestMode && !process.env.CRAWL_SOURCE_COOKIE?.trim() && !process.env.CRAWL_SOURCE_TOKEN?.trim()) throw new Error("Missing source session in CRAWL_SOURCE_COOKIE / CRAWL_SOURCE_TOKEN");
  if (process.env.DATABASE_NAME !== "web_truyen") throw new Error("DATABASE_NAME must be web_truyen; refusing another database");
  await mkdir(CACHE, { recursive: true });
  setDefaultResultOrder("ipv4first");
  const lockFile = path.join(CACHE, "run.lock");
  if (await exists(lockFile)) {
    const pid = Number(await readFile(lockFile, "utf8"));
    if (!Number.isInteger(pid) || pid <= 0) throw new Error("Invalid crawler lock; inspect it before retrying");
    try { process.kill(pid, 0); throw new Error(`Crawler already running: PID ${pid}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    await rm(lockFile);
  }
  const lock = await open(lockFile, "wx");
  await lock.writeFile(String(process.pid));
  let db: PrismaClient | undefined;
  try {
    db = (await import("../lib/prisma")).prisma;
    const database = await db.$queryRaw<Array<{ db: string }>>`SELECT DATABASE() AS db`;
    if (database[0]?.db !== "web_truyen") throw new Error("Connected database is not web_truyen");
    console.log("Verified database: web_truyen");
    const normalization = allChapters ? await normalizeStoredText(db) : undefined;
    if (normalization) console.log("Unicode normalization:", normalization);
    sourceStopped = await exists(guestMode ? PUBLIC_SOURCE_STOP : SOURCE_STOP);
    if (sourceStopped && !localOnly) throw new Error("SOURCE_STOPPED: source previously denied session. Use --finalize-local for DB-only recovery; restore legitimate source access before another network run");
    const before = await totals(db);
    const manifest = manifestSchema.parse(JSON.parse(await readFile(MANIFEST, "utf8")));
    if (manifest.stories.length !== 50 || new Set(manifest.stories.map(row => row.slug)).size !== 50) throw new Error("Expected the existing manifest of 50 unique stories");
    const entries = manifest.stories.slice(0, limit);
    const results: Result[] = [];
    // Five public workers; each holds at most one source request at a time.
    let cursor = 0;
    const client = db;
    await Promise.all(Array.from({ length: allChapters ? 5 : 3 }, async () => {
      while (cursor < entries.length) {
        const index = cursor++;
        const entry = entries[index];
        const result: Result = { slug: entry.slug, status: "failed", chapters: 0, blocked: 0, errors: [] };
        results[index] = result;
        if (!allChapters) console.log(`[${index + 1}/${limit}] ${entry.slug}`);
        try {
          const cached = z.object({ data: detailSchema }).parse(JSON.parse(await readFile(path.join(CACHE, `${entry.slug}.source.json`), "utf8")));
          const detail = cached.data;
          if (!detail.storyExists || detail.story.slug !== entry.slug) throw new Error("Cached source story identity mismatch");
          const local = await client.truyen.findUnique({ where: { slug: entry.slug }, select: { idTruyen: true, isDeleted: true } });
          if (!local || local.isDeleted) throw new Error("Manifest story missing/deleted locally; refusing to create or restore it");
          result.id = local.idTruyen;
          detail.story.title = normalizeVietnamese(detail.story.title).normalize("NFC");
          if (localOnly) result.chapters = await client.chuong.count({ where: { idTruyen: local.idTruyen, ...(allChapters ? {} : { chuongSo: { gte: 1, lte: 15 } }), isDeleted: false, noiDungChuong: { noiDung: { not: "" } } } });
          else if (!sourceStopped && allChapters) await allPublicChapters(client, local.idTruyen, detail, result);
          else if (!sourceStopped) await chapters(client, local.idTruyen, detail, result);
          else result.errors.push("SOURCE_STOPPED: remaining source requests cancelled");
          result.status = allChapters && !localOnly ? (!result.errors.length ? "complete-public" : "incomplete-public") : result.chapters >= 10 ? "complete" : result.chapters > 0 ? "partial" : "metadata-only";
          console.log(allChapters ? `[${index + 1}/${limit}] ${detail.story.title}: +${result.added ?? 0} chương mới (bỏ qua ${result.blocked} chương khóa; ${result.existing ?? 0} đã có; mục lục ${result.listed ?? 0})${result.errors.length ? `; ${result.errors[0]}` : ""}` : `[${index + 1}/${limit}] ${detail.story.title}: ${result.status}, chapters=${result.chapters}${result.errors.length ? `; ${result.errors.join("; ")}` : ""}`);
        } catch (error) { result.errors.push(message(error)); console.error(`[${index + 1}/${limit}] FAILED ${entry.slug}: ${message(error)}`); }
      }
    }));
    const ids = results.flatMap(result => result.id ? [result.id] : []);
    // Pick the first ten eligible stories in manifest order, independent of worker completion order.
    const vipStories: number[] = [];
    for (const result of results) {
      if (!result.id || result.chapters < 10 || vipStories.length >= (allChapters ? 15 : 10)) continue;
      await db.$transaction(async tx => {
        const tail = await tx.chuong.findMany({ where: { idTruyen: result.id, isDeleted: false, noiDungChuong: { noiDung: { not: "" } } }, orderBy: { chuongSo: "desc" }, take: 3, select: { idChuong: true } });
        await tx.chuong.updateMany({ where: { idChuong: { in: tail.map(row => row.idChuong) } }, data: { isFree: false, giaXu: 5 } });
      });
      vipStories.push(result.id);
    }
    const after = await totals(db);
    const imported = await totals(db, ids);
    const delta = Object.fromEntries(Object.keys(after).map(key => [key, after[key as keyof typeof after] - before[key as keyof typeof before]]));
    const report = { database: "web_truyen", finishedAt: new Date().toISOString(), limit, allChapters, guestMode, normalization, localOnly, sourceStopped, before, after, delta, imported, vipStories, results };
    const reportFile = path.join(CACHE, `chapters-${allChapters ? "public-all-" : ""}${localOnly ? "local-" : ""}report-${limit}.json`);
    await atomicJson(reportFile, report);
    console.table({ imported, delta, database: after });
    const incomplete = results.filter(result => result.status !== "complete" && result.status !== "complete-public").length;
    console.log(`Processed ${results.length}/${limit}; incomplete=${incomplete}; report=${reportFile}`);
    if (incomplete) process.exitCode = 2;
  } finally {
    await db?.$disconnect();
    await lock.close();
    await rm(lockFile, { force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(message(error)); process.exitCode = 1; });
}
