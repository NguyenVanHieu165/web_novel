import { load, type CheerioAPI } from "cheerio";
import { z } from "zod";
import type { SourceClient } from "./network";
import { cleanFragment, nameKey, normalized, plainText } from "./normalizer";
import { ImportSourceError, SourceLockedError, type ChapterRef, type ScrapedStory } from "./types";

const TOC = "#list-chapter,#list-chapters,#chapter-list,#chapters,#muc-luc,.list-chapter,.list-chapters,.chapter-list,.chapters-list,.list-chap,.table-of-contents,.toc,.catalogue,.catalog,[data-chapter-list]";
const UNRELATED = "aside,footer,.related,.related-stories,.recommendations,.suggestions,.latest-chapters,.new-chapters,[data-related]";
const CHAPTER_TEXT = /(?:chương|chapter|hồi|chap|episode)\s*(\d+(?:[.,]\d+)?)/iu;
const CHAPTER_PATH = /(?:chuong|chapter|chap|hoi|episode|ep)[-/_=]?(\d+(?:[.,]\d+)?)(?:\b|[-_/.])/iu;
const CATALOGUE_TEXT = /mục lục|danh sách chương|tất cả (?:các )?chương|xem (?:toàn bộ|đầy đủ)|table of contents|all chapters|chapter list/iu;
const records = z.record(z.string(), z.unknown());
type Data = z.infer<typeof records>;
type Document = { html: string; url: string };

function object(value: unknown): Data | null { const parsed = records.safeParse(value); return parsed.success ? parsed.data : null; }
function scalar(value: unknown): string { return typeof value === "string" ? value : ""; }
function schemaTypes(value: Data) { const type = value["@type"]; return (Array.isArray(type) ? type : [type]).filter((item): item is string => typeof item === "string").map(type => type.replace(/^https?:\/\/schema\.org\//, "")); }
function urlOf(value: unknown): string {
  if (typeof value === "string") return value;
  const item = object(value); return item ? scalar(item.url) || scalar(item.contentUrl) || scalar(item["@id"]) : "";
}
function textValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(textValues);
  const item = object(value); const text = typeof value === "string" ? value : item ? scalar(item.name) : "";
  return text ? [normalized(text)] : [];
}
function sameOriginUrl(raw: string, base: string): string | null {
  if (!raw.trim() || /^(?:javascript|data|mailto|tel):/i.test(raw.trim()) || raw.trim().startsWith("#")) return null;
  try {
    const url = new URL(raw, base);
    if (!["https:", "http:"].includes(url.protocol) || url.origin !== new URL(base).origin || url.username || url.password) return null;
    url.hash = ""; return url.href;
  } catch { return null; }
}
function mediaUrl(raw: string, base: string) {
  try { const url = new URL(raw, base); return ["https:", "http:"].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}
export function chapterNumberFrom(title: string, rawUrl = "", fallback?: number) {
  const explicit = normalized(title).match(CHAPTER_TEXT)?.[1];
  const path = rawUrl.match(CHAPTER_PATH)?.[1];
  const value = explicit || path;
  const number = value ? Number(value.replace(",", ".")) : fallback;
  return number !== undefined && Number.isFinite(number) ? number : null;
}

/** Only parse JSON-LD; never evaluate script bodies or infer executable API calls. */
function structured($: CheerioAPI) {
  const roots: unknown[] = [], nodes: Data[] = [];
  $("script[type='application/ld+json']").each((_, el) => {
    try { roots.push(JSON.parse($(el).html() || "")); } catch { /* Invalid optional JSON-LD does not prevent HTML extraction. */ }
  });
  function visit(value: unknown, depth: number) {
    if (depth > 15 || nodes.length >= 2000) return;
    if (Array.isArray(value)) { value.forEach(item => visit(item, depth + 1)); return; }
    const node = object(value); if (!node) return;
    nodes.push(node);
    for (const [key, child] of Object.entries(node)) if (!["@context", "description", "articleBody", "text"].includes(key)) visit(child, depth + 1);
  }
  roots.forEach(root => visit(root, 0)); return nodes;
}
function bookNode(nodes: Data[]) {
  return nodes.find(node => schemaTypes(node).some(type => ["Book", "Novel", "CreativeWorkSeries", "BookSeries"].includes(type)));
}
function structuredChapters(nodes: Data[], base: string) {
  const refs: ChapterRef[] = []; let declared = 0;
  function add(value: unknown, position?: number): boolean {
    const item = object(value);
    if (!item) return false;
    if (schemaTypes(item).includes("ListItem")) {
      const nested = object(item.item);
      return add(nested ? { ...nested, name: nested.name || item.name, url: nested.url || nested["@id"] || item.url } : { name: item.name, url: item.url || item.item }, typeof item.position === "number" ? item.position : position);
    }
    const title = scalar(item.name) || scalar(item.headline), raw = urlOf(item);
    const explicitChapter = schemaTypes(item).includes("Chapter");
    const n = chapterNumberFrom(title, raw, explicitChapter ? position : undefined);
    const url = sameOriginUrl(raw, base);
    if (!url || n === null || !explicitChapter && !CHAPTER_TEXT.test(title) && !CHAPTER_PATH.test(raw)) return false;
    refs.push({ url, number: n, title: normalized(title) || `Chương ${n}` }); return true;
  }
  for (const node of nodes) {
    if (schemaTypes(node).includes("Chapter")) add(node, typeof node.position === "number" ? node.position : undefined);
    if (schemaTypes(node).includes("ItemList") && Array.isArray(node.itemListElement)) {
      const before = refs.length; node.itemListElement.forEach(value => add(value));
      if (refs.length > before && typeof node.numberOfItems === "number" && Number.isInteger(node.numberOfItems)) declared = Math.max(declared, node.numberOfItems);
    }
  }
  return { refs, declared };
}

export function genericMetadata(html: string, url: string): ScrapedStory {
  const $ = load(html), nodes = structured($), book = bookNode(nodes);
  const meta = (key: string) => $(`meta[property="${key}"],meta[name="${key}"]`).first().attr("content") || "";
  const title = normalized(meta("og:title") || scalar(book?.name) || $("h1").first().text() || $("title").text());
  if (!title) throw new ImportSourceError("Không nhận diện được tên truyện từ tiêu đề, Open Graph hoặc JSON-LD. Hãy dùng trang giới thiệu một bộ truyện.");
  const htmlAuthor = meta("author") || $('[itemprop="author"],.author,.book-author,.info-author').first().text().replace(/^tác giả\s*:?/i, "");
  const authors = textValues(book?.author); if (!authors.length && htmlAuthor) authors.push(normalized(htmlAuthor));
  const genres = [...textValues(book?.genre), ...$('[itemprop="genre"],.genres a,.genre a,a[rel="category tag"]').toArray().map(el => normalized($(el).text()))].filter(Boolean);
  const rawImage = meta("og:image") || urlOf(Array.isArray(book?.image) ? book.image[0] : book?.image) || $('[itemprop="image"]').first().attr("src") || $(".book-cover img,.book-img img").first().attr("data-src") || $(".book-cover img,.book-img img").first().attr("src") || "";
  return { title, slug: nameKey(title).slice(0, 220), description: plainText(meta("og:description") || scalar(book?.description) || meta("description") || $('[itemprop="description"],.book-description,.desc-text,.summary__content').first().html() || ""),
    cover: rawImage ? mediaUrl(rawImage, url) : undefined, authors: [...new Set(authors)], genres: [...new Set(genres)],
    completed: /hoàn thành|trọn bộ|\bfull\b|completed/i.test($(".status,.book-status,[itemprop=creativeWorkStatus]").text() + " " + scalar(book?.creativeWorkStatus)), views: 0, chapters: [],
    sourceName: "HTML / JSON-LD", catalogueComplete: false };
}

function htmlChapterLinks($: CheerioAPI, url: string) {
  const scoped = $(TOC).filter((_, el) => !$(el).closest(UNRELATED).length);
  const nodes = scoped.length ? scoped.find("a[href],option[value],[data-chapter-url]").toArray() : $("a[href],option[value],[data-chapter-url]").toArray();
  const refs: ChapterRef[] = [];
  for (const el of nodes) {
    const node = $(el); if (node.closest(UNRELATED).length) continue;
    const raw = node.attr("data-chapter-url") || node.attr("href") || node.attr("value") || "";
    const title = normalized(node.text()), n = chapterNumberFrom(title, raw);
    if (n === null) continue;
    const target = sameOriginUrl(raw, url); if (!target) continue;
    const parentPath = new URL(url).pathname.replace(/\/$/, "");
    if (!scoped.length && !new URL(target).pathname.startsWith(parentPath + "/") && !CHAPTER_PATH.test(raw)) continue;
    refs.push({ url: target, number: n, title: title || `Chương ${n}`, locked: /vip|locked|khóa/i.test(node.attr("class") || "") || node.find(".vip,.locked,.fa-lock").length > 0 });
  }
  return { refs, explicit: scoped.length > 0 };
}
export function genericLinks(html: string, url: string) {
  const $ = load(html); return [...htmlChapterLinks($, url).refs, ...structuredChapters(structured($), url).refs];
}

function declaredChapterCount($: CheerioAPI, url: string) {
  let count = structuredChapters(structured($), url).declared;
  $("[data-total-chapters],[data-chapter-count],meta[itemprop='numberOfItems'],.total-chapters,.chapter-count").each((_, el) => {
    const node = $(el), raw = node.attr("data-total-chapters") || node.attr("data-chapter-count") || node.attr("content") || normalized(node.text()).match(/(?:^|\s)(\d+)\s*(?:chương|chapters?)\b/i)?.[1] || "";
    if (/^\d+$/.test(raw)) count = Math.max(count, Number(raw));
  });
  return count;
}
function catalogueNavigation($: CheerioAPI, url: string, chapterUrls: Set<string>) {
  const links: string[] = [];
  const chapter = (raw: string) => CHAPTER_PATH.test(raw) || chapterUrls.has(raw);
  function push(raw: string) { const target = sameOriginUrl(raw, url); if (target && !chapter(target)) links.push(target); }
  $("a[href],button[data-url],button[data-href]").each((_, el) => {
    const node = $(el); if (node.closest(UNRELATED).length) return;
    const raw = node.attr("href") || node.attr("data-url") || node.attr("data-href") || "";
    const more = /tải thêm|xem thêm|load more|show more/i.test(normalized(node.text())) && node.closest(TOC).length > 0;
    if (more || CATALOGUE_TEXT.test(normalized(node.text())) || /tải thêm chương|xem thêm chương|load more chapters|show more chapters/i.test(normalized(node.text())) || /(?:muc-luc|table-of-contents|\/toc(?:\b|\/))/i.test(raw)) push(raw);
  });
  $(".pagination a[href],.pager a[href],.page-nav a[href],a[rel~=next],link[rel~=next],.pagination [data-url],.pager [data-url]").each((_, el) => {
    if ($(el).closest("aside,footer,.related,.recommendations").length) return;
    push($(el).attr("href") || $(el).attr("data-url") || "");
  });
  $("select").each((_, el) => {
    const node = $(el), identity = `${node.attr("name") || ""} ${node.attr("id") || ""} ${node.attr("class") || ""} ${node.attr("aria-label") || ""}`;
    if (!/page|trang|muc-luc|catalog|toc/i.test(identity) && !node.closest(".pagination,.pager,.page-nav").length) return;
    node.find("option[value]").each((_, option) => push($(option).attr("value") || ""));
  });
  return [...new Set(links)];
}
function unresolvedDynamicCatalogue($: CheerioAPI) {
  return $("button,a,[role=button]").toArray().some(el => {
    const node = $(el), label = normalized(node.text());
    const explicit = /tải thêm chương|xem thêm chương|load more chapters|show more chapters|xem tiếp chương/i.test(label);
    const moreInToc = node.closest(TOC).length > 0 && (/tải thêm|xem thêm|load more|show more/i.test(label) || /load-more|read-more/.test(node.attr("class") || ""));
    if (!explicit && !moreInToc) return false;
    return !(node.attr("href") || node.attr("data-url") || node.attr("data-href"));
  });
}
function unsupportedReason(html: string) {
  const $ = load(html), visible = plainText(html);
  if (/đăng nhập để (?:đọc|xem)|login to (?:read|view)|sign in to (?:read|view)/i.test(visible)) return new SourceLockedError();
  if ($("#__NEXT_DATA__,#root,#app,script[type=module]").length && $("a[href]").length < 6) return new ImportSourceError("Trang nguồn tải mục lục bằng JavaScript/API và không cung cấp liên kết chương trong HTML. Nguồn này cần adapter riêng; đăng nhập trên trình duyệt không tự cấp phiên cho server import.", "UNSUPPORTED_SOURCE");
  return new ImportSourceError("Không tìm thấy mục lục hoặc liên kết chương có số thứ tự. Hãy dùng trang giới thiệu truyện hoặc URL mục lục, không dùng trang chủ/chương riêng.", "INVALID_STORY_URL");
}

export async function fetchDocument(client: SourceClient, url: string): Promise<Document> {
  // Fixture clients and third-party adapters may only implement html().
  if ("document" in client && typeof client.document === "function") return client.document(url);
  return { html: await client.html(url), url };
}
export async function genericStory(first: Document, client: SourceClient, max?: number): Promise<ScrapedStory> {
  const result = genericMetadata(first.html, first.url), pending: Document[] = [first], seenPages = new Set<string>(), seenChapters = new Map<string, ChapterRef>();
  const signatures = new Map<string, string>();
  let expected = 0, explicitToc = false, dynamic = false;
  for (let page = 0; page < pending.length; page++) {
    if (page >= 200) throw new ImportSourceError("Mục lục vượt 200 trang; chưa thể xác nhận lấy hết chương. Nguồn cần adapter phân trang riêng.", "CATALOGUE_INCOMPLETE");
    const item = pending[page]; if (seenPages.has(item.url)) continue;
    const current = item.html ? item : await fetchDocument(client, item.url);
    seenPages.add(item.url); seenPages.add(current.url);
    if (new URL(current.url).origin !== new URL(first.url).origin) throw new ImportSourceError("Mục lục chuyển sang tên miền khác; không tự ghép chương từ nhiều nguồn.", "CATALOGUE_INCOMPLETE");
    const $ = load(current.html), local = htmlChapterLinks($, current.url), ld = structuredChapters(structured($), current.url);
    const refs = [...local.refs, ...ld.refs]; explicitToc ||= local.explicit || ld.refs.length > 0;
    expected = Math.max(expected, declaredChapterCount($, current.url)); dynamic ||= unresolvedDynamicCatalogue($);
    const signature = [...new Set(refs.map(ref => ref.url))].sort().join("\n");
    if (signature && signatures.has(signature) && current.url !== first.url) throw new ImportSourceError("Mục lục trả lặp nội dung ở các trang khác nhau. Đã dừng vì chưa thể xác nhận lấy đủ chương; nguồn cần adapter phân trang riêng.", "CATALOGUE_INCOMPLETE");
    if (signature) signatures.set(signature, current.url);
    refs.forEach(ref => { if (!seenChapters.has(ref.url)) seenChapters.set(ref.url, ref); });
    for (const url of catalogueNavigation($, current.url, new Set(refs.map(ref => ref.url)))) if (!seenPages.has(url) && !pending.some(p => p.url === url)) pending.push({ url, html: "" });
    // Never stop as soon as max links are found: the source may list newest first.
  }
  const numbers = new Set<number>();
  const chapters = [...seenChapters.values()].sort((a, b) => a.number - b.number);
  for (const c of chapters) {
    if (c.number < 0 || c.number > 999999.9 || Math.round(c.number * 10) / 10 !== c.number) throw new ImportSourceError("Số chương vượt độ chính xác database.");
    if (numbers.has(c.number)) throw new ImportSourceError("Mục lục có nhiều URL khác nhau cho cùng số chương. Cần adapter riêng để phân biệt phần/chương, tránh ghi đè nội dung.", "CATALOGUE_INCOMPLETE");
    numbers.add(c.number);
  }
  if (!chapters.length) throw unsupportedReason(first.html);
  const warnings: string[] = [];
  if (expected && chapters.length < expected) warnings.push(`Nguồn khai báo ${expected} chương nhưng HTML mục lục chỉ tìm thấy ${chapters.length}; chưa thể xác nhận toàn bộ.`);
  if (dynamic) warnings.push("Mục lục có nút tải thêm bằng JavaScript chưa có URL tĩnh; cần adapter API để lấy phần còn lại.");
  const startsAtBeginning = chapters[0].number === 0 || chapters[0].number === 1;
  const gaps = chapters.some((c, index) => index > 0 && c.number > chapters[index - 1].number + 1);
  if (!startsAtBeginning) warnings.push(`Mục lục bắt đầu từ chương ${chapters[0].number}; có thể chỉ là danh sách chương mới nhất.`);
  if (gaps && !expected) warnings.push("Mục lục có khoảng trống số chương và không có tổng số để đối chiếu.");
  if (!explicitToc && !expected) warnings.push("Chỉ tìm thấy các liên kết chương rời rạc, chưa nhận diện được mục lục đầy đủ của nguồn.");
  result.catalogueComplete = !dynamic && (expected > 0 ? chapters.length >= expected : explicitToc && startsAtBeginning && !gaps);
  if (!result.catalogueComplete && !warnings.length) warnings.push("Chưa đủ dữ liệu để xác nhận mục lục đầy đủ.");
  result.sourceTotalChapters = expected || (result.catalogueComplete ? chapters.length : undefined);
  result.warnings = warnings; result.chapters = chapters.slice(0, max); return result;
}

function escapeText(value: string) { return load("<div></div>")("div").text(value).html() || ""; }
function absolutizeImages(html: string, base: string) {
  const $ = load(html, {}, false);
  $("img").each((_, el) => { for (const attr of ["src", "data-src", "data-original"]) { const raw = $(el).attr(attr); if (raw) { const url = mediaUrl(raw, base); if (url) $(el).attr(attr, url); else $(el).removeAttr(attr); } } });
  return $.html();
}
export function genericChapter(html: string, url: string): string {
  const original = load(html), nodes = structured(original);
  const declared = nodes.find(node => schemaTypes(node).some(t => ["Chapter", "Article", "BlogPosting"].includes(t)) && (typeof node.articleBody === "string" || typeof node.text === "string"));
  if (declared) {
    if (declared.isAccessibleForFree === false) throw new SourceLockedError();
    const body = scalar(declared.articleBody) || scalar(declared.text);
    if (body.length >= 100) return escapeText(body);
  }
  const $ = cleanFragment(html);
  $(".related,.recommendations,.chapter-tools,.chapter-header,.chapter-footer,.chapter-nav,.chapter-navigation,.comments,#comments,.comment-list,.breadcrumb").remove();
  const selectors = ["#chapter-content", "#chapter-c", "#content-chapter", ".chapter-content", ".chapter-c", ".reading-content", ".read-content", ".chapter-inner", ".chapter-text", ".truyen", "[itemprop=articleBody]", ".entry-content", ".text-left", "article", "main"];
  const candidates = new Map<object, { html: string; score: number }>();
  selectors.forEach((selector, priority) => $(selector).each((_, el) => {
    if (candidates.has(el)) return;
    const node = $(el), text = normalized(node.text()), imageCount = node.find("img").length;
    if (text.length < 100 && imageCount < 1) return;
    const linkChars = node.find("a").toArray().reduce((n, link) => n + normalized($(link).text()).length, 0);
    if (linkChars > text.length * 0.35) return;
    // Main/article are fallbacks; an explicit chapter container wins over surrounding prose.
    const explicit = priority < 11;
    const score = Math.min(text.length, 50000) + Math.min(imageCount, 20) * 100 + (explicit ? 100000 : 0) - priority * 100;
    candidates.set(el, { html: node.html() || "", score });
  }));
  const best = [...candidates.values()].sort((a, b) => b.score - a.score)[0];
  if (!best) {
    if (/đăng nhập để (?:đọc|xem)|mua chương để|nâng cấp vip để|login to read|unlock chapter/i.test(plainText(html))) throw new SourceLockedError();
    if (original("#__NEXT_DATA__,#root,#app,script[type=module]").length) throw new ImportSourceError("Nội dung chương chỉ được tải bằng JavaScript/API, không có toàn văn trong HTML. Nguồn cần adapter riêng; chưa lưu nội dung xem thử.", "UNSUPPORTED_SOURCE");
    throw new ImportSourceError("Không tìm thấy khối toàn văn chương đủ tin cậy trong HTML/JSON-LD. Nguồn cần adapter riêng.", "UNSUPPORTED_SOURCE");
  }
  if (/đăng nhập để (?:đọc|xem)|mua chương để|nâng cấp vip để|login to read|unlock chapter/i.test(plainText(best.html))) throw new SourceLockedError();
  return absolutizeImages(best.html, url);
}
