import { load } from "cheerio";
import { z } from "zod";
import type { SourceClient } from "./network";
import { normalized, nameKey, plainText } from "./normalizer";
import { fetchDocument, genericChapter, genericStory } from "./generic";
import { encryptSource, decryptSource } from "./laca-codec";
import { ImportSourceError, SourceLockedError, type ChapterRef, type ScrapedStory } from "./types";

const record = z.record(z.string(), z.unknown());
function initial(html: string, selector: string, assignment = false) {
  const $ = load(html);
  const source = assignment ? $("script").toArray().map(el => $(el).html() || "").find(t => /window\.__INITIAL_DATA__\s*=/.test(t))?.replace(/^[\s\S]*?window\.__INITIAL_DATA__\s*=\s*/, "").replace(/;\s*$/, "") : $(selector).html();
  if (!source) throw new ImportSourceError("Nguồn thay đổi cấu trúc dữ liệu.");
  return record.parse(JSON.parse(source));
}
const numberOf = (title: string, fallback: number) => Number(normalized(title).match(/(?:chương|chapter|hồi)\s*(\d+(?:[.,]\d+)?)/i)?.[1]?.replace(",", ".") ?? fallback);
function unique(rows: ChapterRef[]) {
  const urls = new Set<string>(), numbers = new Set<number>();
  return rows.filter(r => {
    if (!Number.isFinite(r.number) || r.number < 0 || r.number > 999999.9 || Math.round(r.number * 10) / 10 !== r.number) throw new ImportSourceError("Số chương vượt độ chính xác database.");
    if (urls.has(r.url)) return false;
    if (numbers.has(r.number)) throw new ImportSourceError("Mục lục nguồn trùng số chương; cần kiểm tra thủ công.");
    urls.add(r.url); numbers.add(r.number); return true;
  }).sort((a, b) => a.number - b.number);
}
function publicHtml(html: string) {
  if (/đăng nhập để (?:đọc|xem)|mua chương để|nâng cấp vip để/i.test(plainText(html))) throw new SourceLockedError();
  if (!plainText(html) && !load(html)("img").length) throw new SourceLockedError();
  return html;
}
const tdvRef = z.object({ _id: z.coerce.string().regex(/^\d+$/), ContentOrder: z.number(), ContentTitle: z.string(), IsVip: z.boolean().optional(), IsLocked: z.boolean().optional(), IsActive: z.boolean().optional() });
async function tdvStory(url: string, html: string, client: SourceClient, max?: number): Promise<ScrapedStory> {
  const data = initial(html, "", true), origin = new URL(url).origin;
  const book = z.object({ _id: z.coerce.string(), ContentTitle: z.string(), SeoUrl: z.string(), Recap: z.string().nullish(), Thumbnail: z.string().nullish(), ChapterCount: z.number().int().nonnegative().optional(), Note2: z.string().nullish(), IsVip: z.boolean().optional(), SubCategories: z.array(z.number()).default([]), ListAuthors: z.array(z.object({ ContentTitle: z.string() })).default([]) }).parse(data.CurrentBook);
  if (book.IsVip) throw new SourceLockedError();
  const cats = z.array(z.object({ _id: z.number(), CategoryName: z.string() })).parse(data.Categories ?? []);
  const refs: ChapterRef[] = [], seen = new Set<string>();
  for (let page = 1; page <= 1000; page++) {
    const payload = z.object({ IsError: z.literal(false), Results: z.array(tdvRef) }).parse(await client.json(`${origin}/api/v1/chapters/listByBook`, { bookId: book._id, curPage: page, pageSize: 500, sortDir: "asc" }));
    if (!payload.Results.length) {
      if (book.ChapterCount !== undefined && refs.length < Math.min(max ?? Infinity, book.ChapterCount)) throw new ImportSourceError(`Mục lục Truyện Đọc Việt chỉ trả ${refs.length}/${book.ChapterCount} chương. Chưa thể xác nhận đầy đủ; hãy thử lại sau.`, "CATALOGUE_INCOMPLETE");
      return finish(true);
    }
    if (payload.Results.every(c => seen.has(c._id))) throw new ImportSourceError("Mục lục lặp trang; không thể xác nhận đầy đủ.", "CATALOGUE_INCOMPLETE");
    for (const c of payload.Results) {
      if (seen.has(c._id)) continue; seen.add(c._id);
      refs.push({ number: c.ContentOrder, title: normalized(c.ContentTitle), url: `${origin}/doc-truyen/${book.SeoUrl}/read/${c._id}.html`, locked: c.IsVip || c.IsLocked || c.IsActive === false });
    }
    if (max && refs.length >= max) return finish(false);
  }
  throw new ImportSourceError("Mục lục vượt 1000 trang; hãy nhập giới hạn chương.", "CATALOGUE_INCOMPLETE");
  function finish(exhausted: boolean): ScrapedStory { return { title: normalized(book.ContentTitle), slug: nameKey(book.ContentTitle), description: plainText(book.Recap || ""), cover: book.Thumbnail ? new URL(book.Thumbnail, url).href : undefined, authors: book.ListAuthors.map(a => normalized(a.ContentTitle)), genres: cats.filter(c => book.SubCategories.includes(c._id)).map(c => normalized(c.CategoryName)), completed: book.Note2 === "FULL", views: Number(record.safeParse(data.PageData).data?.totalViews) || 0, chapters: unique(refs).slice(0, max), sourceName: "Truyện Đọc Việt", catalogueComplete: exhausted || book.ChapterCount !== undefined && refs.length >= book.ChapterCount, sourceTotalChapters: book.ChapterCount }; }
}
async function lacaStory(url: string, html: string, client: SourceClient, max?: number): Promise<ScrapedStory> {
  const data = record.parse(record.parse(initial(html, "#__NEXT_DATA__").props).pageProps), origin = new URL(url).origin;
  const b = z.object({ id: z.number(), title: z.string(), slug: z.string(), author: z.string().nullish(), description: z.string().nullish(), detail: z.string().nullish(), image: z.string().nullish(), status: z.string(), view: z.coerce.number().default(0) }).parse(data.story);
  const chapters: ChapterRef[] = [], seen = new Set<number>();
  for (let page = 1; page <= 1000; page++) {
    const result = z.object({ data: z.string() }).parse(await client.json(`${origin}/api/chapters/list-chapters`, { id_story: encryptSource(String(b.id)), page: encryptSource(String(page)), items_per_page: encryptSource("100"), order: encryptSource("ASC") }));
    const rows = z.array(z.object({ id: z.number(), title: z.string(), slug: z.string(), chapter_order: z.number() })).parse(JSON.parse(decryptSource(result.data)));
    if (!rows.length) return finish(true);
    if (rows.every(c => seen.has(c.id))) throw new ImportSourceError("Mục lục lặp trang.");
    for (const c of rows) { if (seen.has(c.id)) continue; seen.add(c.id); chapters.push({ number: numberOf(c.title, c.chapter_order), title: normalized(c.title), url: new URL(`/chapter/${encodeURIComponent(c.slug)}`, origin).href }); }
    if (max && chapters.length >= max) return finish(false);
  }
  throw new ImportSourceError("Mục lục vượt giới hạn an toàn; hãy nhập giới hạn chương.");
  function finish(exhausted: boolean): ScrapedStory { return { title: normalized(b.title), slug: nameKey(b.slug), description: plainText(b.description || b.detail || ""), authors: b.author ? [normalized(b.author)] : [], genres: z.array(z.object({ category_title: z.string() })).parse(data.categories ?? []).map(g => normalized(g.category_title)), completed: /full|hoan.?thanh|completed|^2$/i.test(b.status), cover: b.image ? new URL(b.image, url).href : undefined, views: b.view, chapters: unique(chapters).slice(0, max), sourceName: "Lạc Ca Truyện", catalogueComplete: exhausted, sourceTotalChapters: exhausted ? chapters.length : undefined }; }
}

export { genericMetadata, genericLinks } from "./generic";
export async function scrapeStory(url: string, client: SourceClient, max?: number): Promise<ScrapedStory> {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host === "lohi2.com") return lohiStory(url.replace("//www.lohi2.com/", "//lohi2.com/"), client, max);
  const document = await fetchDocument(client, url);
  const finalHost = new URL(document.url).hostname.replace(/^www\./, "");
  if (finalHost === "truyendocviet1.shop") return tdvStory(document.url, document.html, client, max);
  if (finalHost === "lacatruyen.email") return lacaStory(document.url, document.html, client, max);
  if (finalHost === "lohi2.com") return lohiStory(document.url, client, max);
  return genericStory(document, client, max);
}
export async function scrapeChapter(ref: ChapterRef, client: SourceClient) {
  if (ref.locked) throw new SourceLockedError();
  const host = new URL(ref.url).hostname.replace(/^www\./, "");
  if (host === "lohi2.com") return lohiChapter(ref, client);
  const document = await fetchDocument(client, ref.url), html = document.html;
  if (host === "truyendocviet1.shop") {
    const data = initial(html, "", true);
    const c = z.object({ _id: z.coerce.string(), ContentOrder: z.number(), Description: z.string().nullish(), GuestTeaser: z.boolean().optional(), IsSecurityGate: z.boolean().optional(), IsVip: z.boolean().optional(), IsLocked: z.boolean().optional() }).parse(record.parse(data.PageData).chapterInfo);
    if (!ref.url.endsWith(`/${c._id}.html`) || c.ContentOrder !== ref.number) throw new ImportSourceError("Nội dung không khớp chương nguồn.");
    if (c.GuestTeaser || c.IsSecurityGate || c.IsVip || c.IsLocked || !c.Description) throw new SourceLockedError();
    // Plain source paragraphs need HTML escaping before the shared fragment parser.
    return publicHtml(/<[a-z][^>]*>/i.test(c.Description) ? c.Description : load("<div></div>")("div").text(c.Description).html() || "");
  }
  if (host === "lacatruyen.email") {
    const d = record.parse(record.parse(initial(html, "#__NEXT_DATA__").props).pageProps);
    const lock = record.parse(d.story).lock;
    if (lock === "all" || lock === "login" || d.notify && d.notify !== "success") throw new SourceLockedError();
    const c = z.object({ slug: z.string(), content: z.string(), fee: z.coerce.number().default(0) }).safeParse(d.chapter);
    if (!c.success || c.data.fee > 0 || c.data.content.startsWith("U2FsdGVkX1")) throw new SourceLockedError();
    if (decodeURIComponent(new URL(ref.url).pathname.split("/").pop() || "") !== c.data.slug) throw new ImportSourceError("Nội dung không khớp chương nguồn.");
    return publicHtml(c.data.content);
  }
  return genericChapter(html, document.url);
}

const LOHI_API = "https://api.lohi2.com/novel";
const lohiChapterRef = z.object({ id: z.string(), chapterNumber: z.number().int().positive(), titleVi: z.string().nullish(), isVip: z.boolean().optional(), isLocked: z.boolean().optional() });
async function lohiStory(url: string, client: SourceClient, max?: number): Promise<ScrapedStory> {
  const slug = new URL(url).pathname.match(/^\/truyen\/([a-z0-9-]+)\/?$/i)?.[1];
  if (!slug) throw new ImportSourceError("LoHi: hãy dùng URL trang truyện, ví dụ https://lohi2.com/truyen/kiem-lai.");
  const book = z.object({ slug: z.string(), titleVi: z.string(), synopsis: z.string().nullish(),
    authorVi: z.string().nullish(), authorNameVi: z.string().nullish(), genres: z.array(z.string()),
    completionStatus: z.string(), coverImageUrl: z.string().url().nullish(), readCount: z.number().default(0),
    access: z.string(), vipFromChapter: z.number().nullish(), totalChapters: z.number().int().nonnegative(),
  }).parse(await client.json(`${LOHI_API}/novels/${encodeURIComponent(slug)}`));
  if (book.slug !== slug) throw new ImportSourceError("LoHi trả về truyện không khớp URL.");
  if (book.access !== "open") throw new SourceLockedError();
  const chapters: ChapterRef[] = [], seen = new Set<string>();
  for (let offset = 0, page = 0; page < 1000; page++) {
    const rows = z.array(lohiChapterRef).parse(await client.json(`${LOHI_API}/novels/${slug}/chapters?limit=100&offset=${offset}`));
    if (!rows.length) {
      if (!max && chapters.length < book.totalChapters) throw new ImportSourceError("Mục lục LoHi chưa trả đủ số chương. Hãy thử lại với giới hạn chương.");
      return finish(true);
    }
    if (rows.some(c => seen.has(c.id))) throw new ImportSourceError("Mục lục LoHi lặp trang; đã dừng để tránh nhập thiếu/trùng.");
    for (const c of rows) {
      seen.add(c.id);
      chapters.push({ number: c.chapterNumber, title: normalized(c.titleVi || `Chương ${c.chapterNumber}`),
        url: `https://lohi2.com/truyen/${slug}/chuong-${c.chapterNumber}`,
        locked: c.isVip || c.isLocked || book.vipFromChapter != null && c.chapterNumber >= book.vipFromChapter });
    }
    offset += rows.length;
    if (max && chapters.length >= max) return finish(false);
  }
  throw new ImportSourceError("Mục lục LoHi vượt giới hạn an toàn; hãy nhập giới hạn chương.");
  function finish(exhausted: boolean): ScrapedStory {
    const author = normalized(book.authorNameVi || book.authorVi || "");
    return { title: normalized(book.titleVi), slug: nameKey(book.titleVi), description: plainText(book.synopsis || ""),
      authors: author ? [author] : [], genres: book.genres.map(normalized), completed: book.completionStatus === "completed",
      cover: book.coverImageUrl || undefined, views: book.readCount, chapters: unique(chapters).slice(0, max), sourceName: "LoHi", sourceTotalChapters: book.totalChapters, catalogueComplete: exhausted || chapters.length >= book.totalChapters };
  }
}
async function lohiChapter(ref: ChapterRef, client: SourceClient) {
  const match = new URL(ref.url).pathname.match(/^\/truyen\/([a-z0-9-]+)\/chuong-(\d+)$/i);
  if (!match) throw new ImportSourceError("URL chương LoHi không hợp lệ.");
  const result = z.object({ vipLocked: z.boolean().optional(), orbitBuyInLocked: z.boolean().optional(),
    requiresLogin: z.boolean().optional(), preview: z.boolean().optional(), truncated: z.boolean().optional(),
    novel: z.object({ slug: z.string().optional() }).passthrough().nullish(),
    chapter: z.object({ chapterNumber: z.number(), content: z.string().nullish(), isVip: z.boolean().optional(), isLocked: z.boolean().optional(),
      preview: z.boolean().optional(), truncated: z.boolean().optional(), requiresLogin: z.boolean().optional() }).nullish(),
  }).parse(await client.json(`${LOHI_API}/chapters/${match[1]}/${match[2]}`));
  const c = result.chapter;
  if (result.vipLocked || result.orbitBuyInLocked || result.requiresLogin || result.preview || result.truncated || !c?.content || c.isVip || c.isLocked || c.preview || c.truncated || c.requiresLogin) throw new SourceLockedError();
  if (c.chapterNumber !== ref.number || result.novel?.slug && result.novel.slug !== match[1]) throw new ImportSourceError("Nội dung LoHi không khớp truyện/chương nguồn.");
  const html = /<[a-z][^>]*>/i.test(c.content) ? c.content : load("<div></div>")("div").text(c.content).html() || "";
  return publicHtml(html);
}
