import assert from "node:assert/strict";
import test from "node:test";
import { chapterContent } from "../lib/scraper/normalizer.ts";
import { genericLinks, genericMetadata, scrapeChapter, scrapeStory } from "../lib/scraper/adapters.ts";
import { genericChapter } from "../lib/scraper/generic.ts";
import { ImportSourceError, SourceLockedError } from "../lib/scraper/types.ts";

const base = "https://novels.example/book/";
const chapter = n => `<a href="chapter-${n}">Chapter ${n}: Title</a>`;
const toc = ns => `<nav class="chapter-list">${ns.map(chapter).join("")}</nav>`;
const meta = '<meta property="og:title" content="A Novel">';
const clientFor = (pages, calls = []) => ({ async html(url) { calls.push(url); assert.ok(url in pages, `Unexpected URL ${url}`); return pages[url]; } });

test("generic Book JSON-LD supports graph, authors, image object, and genres without executing scripts", () => {
  const data = { "@context": "https://schema.org", "@graph": [{ "@type": "WebSite", name: "Site" }, { "@type": "Book", name: "Tên Truyện", description: "Văn án", author: [{ "@type": "Person", name: "Tác Giả" }, { name: "Nhóm Dịch" }], image: { contentUrl: "/cover.jpg" }, genre: ["Tiên Hiệp", "Huyền Huyễn"], creativeWorkStatus: "Completed" }] };
  const book = genericMetadata(`<script>throw Error("must not execute")</script><script type="application/ld+json">${JSON.stringify(data)}</script>`, base);
  assert.equal(book.title, "Tên Truyện"); assert.equal(book.cover, "https://novels.example/cover.jpg");
  assert.deepEqual(book.authors, ["Tác Giả", "Nhóm Dịch"]); assert.deepEqual(book.genres, ["Tiên Hiệp", "Huyền Huyễn"]); assert.ok(book.completed);
});
test("HTML fallback survives malformed optional JSON-LD and Open Graph wins for title", () => {
  const book = genericMetadata(`${meta}<h1>Book</h1><script type="application/ld+json">not valid JSON</script>`, base);
  assert.equal(book.title, "A Novel");
});
test("scoped TOC supports anchors, chapter select options and avoids latest/related links", () => {
  const html = `${meta}<div class="latest-chapters">${chapter(9)}</div>${toc([1, 2])}<aside>${chapter(3)}</aside><div class="chapter-list"><select><option value="chapter-3">Chapter 3</option></select></div><a href="https://evil.example/chapter-4">Chapter 4</a>`;
  assert.deepEqual(genericLinks(html, base).map(c => c.number), [1, 2, 3]);
});
test("explicit full TOC exhausted from beginning is marked complete", async () => {
  const book = await scrapeStory(base, clientFor({ [base]: `${meta}${toc([1, 2, 3])}` }));
  assert.equal(book.catalogueComplete, true); assert.equal(book.sourceTotalChapters, 3); assert.equal(book.chapters.length, 3);
});
test("max chapters traverses descending pagination before selecting earliest chapters", async () => {
  const calls = [];
  const pages = { [base]: `${meta}${toc([5, 4])}<link rel="next" href="?page=2">`, [base + "?page=2"]: `${toc([3, 2])}<div class="pagination"><a href="?page=3">3</a></div>`, [base + "?page=3"]: toc([1]) };
  const book = await scrapeStory(base, clientFor(pages, calls), 2);
  assert.equal(calls.length, 3); assert.deepEqual(book.chapters.map(c => c.number), [1, 2]); assert.ok(book.catalogueComplete);
});
test("dedicated TOC route and static button data URLs are discovered without running JavaScript", async () => {
  const pages = { [base]: `${meta}<button data-url="contents">Danh sách chương</button>`, [base + "contents"]: `<div class="chapter-list"><a href="../chapter-1">Chapter 1</a></div><button data-url="contents?page=2">Tải thêm chương</button>`, [base + "contents?page=2"]: `<div class="chapter-list"><a href="../chapter-2">Chapter 2</a></div>` };
  const book = await scrapeStory(base, clientFor(pages));
  assert.deepEqual(book.chapters.map(c => c.number), [1, 2]); assert.ok(book.catalogueComplete);
});
test("pagination selects support every explicitly declared page URL", async () => {
  const pages = { [base]: `${meta}${toc([3])}<select name="chapter-page"><option value="?page=2">Page 2</option><option value="?page=3">Page 3</option></select>`, [base + "?page=2"]: toc([2]), [base + "?page=3"]: toc([1]) };
  const book = await scrapeStory(base, clientFor(pages)); assert.deepEqual(book.chapters.map(c => c.number), [1, 2, 3]);
});
test("a repeated page fails with an actionable incomplete-catalogue error", async () => {
  const repeated = `${meta}${toc([1])}<a rel="next" href="?page=2">Next</a>`;
  await assert.rejects(scrapeStory(base, clientFor({ [base]: repeated, [base + "?page=2"]: repeated })), error => error instanceof ImportSourceError && error.code === "CATALOGUE_INCOMPLETE");
});
test("partial/latest-only and JavaScript load-more lists never claim all chapters", async () => {
  for (const html of [`${meta}${toc([90, 91])}`, `${meta}<div class="chapter-list">${chapter(1)}<button>Tải thêm chương</button></div>`, `${meta}<div class="chapter-list">${chapter(1)}<button>Load more</button></div>`, `${meta}${chapter(1)}${chapter(2)}`]) {
    const book = await scrapeStory(base, clientFor({ [base]: html })); assert.equal(book.catalogueComplete, false); assert.ok(book.warnings.length > 0);
  }
});
test("JSON-LD ItemList positions and total number report missing catalogue entries", async () => {
  const data = { "@type": "ItemList", numberOfItems: 3, itemListElement: [{ "@type": "ListItem", position: 1, item: { "@type": "Chapter", name: "Beginning", url: "read/first" } }, { "@type": "ListItem", position: 2, item: { "@type": "Chapter", name: "Middle", url: "read/second" } }] };
  const html = `${meta}<script type="application/ld+json">${JSON.stringify(data)}</script>`;
  const book = await scrapeStory(base, clientFor({ [base]: html }));
  assert.deepEqual(book.chapters.map(c => c.number), [1, 2]); assert.equal(book.sourceTotalChapters, 3); assert.equal(book.catalogueComplete, false); assert.match(book.warnings[0], /3.*2/);
});
test("unrelated JSON-LD ItemLists do not invent novel chapter counts", async () => {
  const data = { "@type": "ItemList", numberOfItems: 100, itemListElement: [{ "@type": "ListItem", position: 1, item: { "@type": "Book", name: "Another Book", url: "/other-book" } }] };
  const html = `${meta}${toc([1])}<script type="application/ld+json">${JSON.stringify(data)}</script>`;
  const book = await scrapeStory(base, clientFor({ [base]: html })); assert.equal(book.sourceTotalChapters, 1); assert.ok(book.catalogueComplete);
});
test("duplicate chapter numbers across different URLs fail rather than overwriting", async () => {
  await assert.rejects(scrapeStory(base, clientFor({ [base]: `${meta}${toc([1])}<div class="chapter-list"><a href="alternate-chapter-1">Chapter 1</a></div>` })), /cùng số chương/);
});
test("a JavaScript-only app explains unsupported source without executing page code", async () => {
  await assert.rejects(scrapeStory(base, clientFor({ [base]: `${meta}<div id="app"></div><script type="module">fetch('/hidden-api')</script>` })), error => error instanceof ImportSourceError && error.code === "UNSUPPORTED_SOURCE" && /JavaScript/.test(error.message));
});
test("canonical redirects resolve relative chapters and illustration URLs from final document", async () => {
  const original = "https://novels.example/old-book", final = "https://novels.example/books/new-book/";
  const story = await scrapeStory(original, { async document() { return { html: `${meta}${toc([1])}`, url: final }; } });
  assert.equal(story.chapters[0].url, final + "chapter-1");
  const content = await scrapeChapter(story.chapters[0], { async document() { return { html: `<div class="chapter-content"><p>${"Content. ".repeat(30)}</p><img data-original="../illustration.jpg"></div>`, url: final + "chapters/one/" }; } });
  assert.ok(content.includes('data-original="https://novels.example/books/new-book/chapters/illustration.jpg"'));
});
test("generic chapter extraction prefers actual chapter containers over surrounding text and never follows comments", async () => {
  const body = "Đây là toàn văn chương. ".repeat(30), noise = "Site information. ".repeat(100);
  const html = `<main><p>${noise}</p><div id="chapter-content"><p>${body}</p><img data-src="illustration.jpg"></div><div id="comments">comment</div></main>`;
  const result = genericChapter(html, base + "chapter-1");
  assert.ok(result.includes(body)); assert.ok(!result.includes("Site information")); assert.ok(!result.includes("comment"));
  assert.ok(result.includes('data-src="https://novels.example/book/illustration.jpg"'));
  assert.ok((await chapterContent(result, async () => null)).includes(body.trim()));
});
test("JSON-LD chapter plaintext preserves paragraphs; paywall and JS-only bodies report exact reasons", async () => {
  const body = "Đoạn đầu. ".repeat(15) + "\n\nĐoạn sau.";
  const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "Chapter", articleBody: body })}</script>`;
  assert.ok((await chapterContent(genericChapter(html, base), async () => null)).includes("\n\nĐoạn sau."));
  assert.throws(() => genericChapter(`<script type="application/ld+json">${JSON.stringify({ "@type": "Chapter", articleBody: body, isAccessibleForFree: false })}</script>`, base), SourceLockedError);
  assert.throws(() => genericChapter('<div id="app"></div><script type="module">readContent()</script>', base), error => error instanceof ImportSourceError && error.code === "UNSUPPORTED_SOURCE");
});
test("Truyện Đọc Việt all mode checks declared chapter count instead of accepting a partial empty page", async () => {
  let page = 0;
  const html = `<script>window.__INITIAL_DATA__=${JSON.stringify({ CurrentBook: { _id: "7", ContentTitle: "Book", SeoUrl: "book", ChapterCount: 2 }, Categories: [] })};</script>`;
  const client = { async html() { return html; }, async json() { return { IsError: false, Results: page++ ? [] : [{ _id: "1", ContentOrder: 1, ContentTitle: "Chương 1" }] }; } };
  await assert.rejects(scrapeStory("https://truyendocviet1.shop/doc-truyen/book.html", client), error => error instanceof ImportSourceError && error.code === "CATALOGUE_INCOMPLETE");
});
