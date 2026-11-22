import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import { chapterContent, nameKey } from "../lib/scraper/normalizer.ts";
import { genericLinks, genericMetadata, scrapeStory, scrapeChapter } from "../lib/scraper/adapters.ts";
import { publicTarget, isPublicAddress, selectPublicAddress, pause, safeRequest } from "../lib/scraper/network.ts";
import { storeImportChapter, ensureImportDatabase } from "../lib/scraper/storage.ts";
import { importUrlSchema, ImportSourceError, SourceBlockedError, SourceLockedError, SourceRateLimitError } from "../lib/scraper/types.ts";
import { importErrorCode, importErrorMessage } from "../lib/scraper/errors.ts";

test("SSRF blocks private, mapped, loopback, metadata, reserved IPs and non-HTTP URLs", async () => {
  for (const ip of ["127.0.0.1", "10.2.3.4", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "192.0.2.1", "224.0.0.1"]) assert.equal(isPublicAddress(ip), false, ip);
  assert.ok(isPublicAddress("8.8.8.8")); assert.ok(isPublicAddress("2606:4700:4700::1111"));
  for (const url of ["file:///etc/passwd", "http://127.1/a", "http://2130706433", "http://[::ffff:127.0.0.1]/", "http://user:pass@example.com", "http://localhost", "http://example.com:8080"]) await assert.rejects(publicTarget(url));
});
test("normalizer preserves paragraphs and lazy images, drops active HTML and repairs spacing accents", async () => {
  const images = [];
  const output = await chapterContent('<p>Hă´n đê´n.</p><script>bad</script><style>bad</style><iframe>bad</iframe><div class="ads">ad</div><img src="placeholder" data-src="/real.jpg" onerror="alert(1)"><p>Kết.</p>', async (src) => { images.push(src); return '<img src="/uploads/chapters/book/' + "a".repeat(64) + '.webp" alt="Ảnh" />'; });
  assert.deepEqual(images, ["/real.jpg"]); assert.ok(output.includes("Hắn đến.")); assert.ok(output.includes("\n\n"));
  assert.ok(!/script|style|iframe|onerror|bad|>ad</.test(output)); assert.ok(output.includes('<img src="/uploads/chapters/'));
  assert.equal(nameKey("  Tiên   hiệp ".normalize("NFD")), nameKey("Tiên Hiệp"));
});
test("generic extraction reads metadata, chapter numbers and same-origin links", () => {
  const html = '<meta property="og:title" content="Truyện Mới"><meta property="og:image" content="/cover.jpg"><meta property="og:description" content="Văn án"><meta name="author" content="Tác Giả"><h1>Other</h1><div class="status">Hoàn thành</div><a href="/book/chuong-2">Chương 2: Hai</a><a href="/book/chuong-1">Chương 1</a><a href="https://evil.example/chuong-3">Chương 3</a>';
  const meta = genericMetadata(html, "https://example.com/book");
  assert.equal(meta.title, "Truyện Mới"); assert.equal(meta.cover, "https://example.com/cover.jpg"); assert.ok(meta.completed);
  assert.equal(genericLinks(html, "https://example.com/book").length, 2);
});
test("generic catalogue follows pagination, deduplicates links, and respects requested scope", async () => {
  const pages = { "https://example.com/book": '<h1>Book</h1><a href="/book/chuong-1">Chương 1</a><div class="pagination"><a href="/book?page=2">2</a></div>', "https://example.com/book?page=2": '<a href="/book/chuong-1">Chương 1</a><a href="/book/chuong-2">Chương 2</a>' };
  const client = { async html(url) { return pages[url]; } };
  assert.equal((await scrapeStory("https://example.com/book", client)).chapters.length, 2);
  assert.equal((await scrapeStory("https://example.com/book", client, 1)).chapters.length, 1);
});
test("TDV catalogue pagination and chapter preview/access flags are honored", async () => {
  let calls = 0;
  const embed = (data) => `<script>window.__INITIAL_DATA__ = ${JSON.stringify(data)};</script>`;
  const client = { async html() { return embed({ CurrentBook: { _id: "4", ContentTitle: "Full", SeoUrl: "full", SubCategories: [2], Note2: "FULL" }, Categories: [{ _id: 2, CategoryName: "Tiên Hiệp" }] }); }, async json() { return { IsError: false, Results: calls++ ? [] : [{ _id: "7", ContentOrder: 1, ContentTitle: "Chương 1" }] }; } };
  const result = await scrapeStory("https://truyendocviet1.shop/doc-truyen/full.html", client);
  assert.equal(calls, 2); assert.ok(result.completed); assert.equal(result.chapters[0].number, 1);
  await assert.rejects(scrapeChapter(result.chapters[0], { async html() { return embed({ PageData: { chapterInfo: { _id: "7", ContentOrder: 1, Description: "preview", GuestTeaser: true } } }); } }), SourceLockedError);
});
test("chapter writes are atomic, skip existing bodies, detect slug conflicts, and propagate rollback errors", async () => {
  let creates = 0, transactions = 0;
  const tx = { chuong: { async findUnique() { return { idChuong: 8, isDeleted: false, noiDungChuong: { idNoiDungChuong: 9, noiDung: "original" } }; }, async create() { creates++; return { idChuong: 9 }; } }, noiDungChuong: { async upsert() { throw Error("body failed"); } } };
  const db = { async $transaction(work) { transactions++; return work(tx); } };
  const ref = { number: 1, title: "Chương 1", url: "https://example.com/c1" };
  assert.equal(await storeImportChapter(db, 2, ref, "text", true), false); assert.equal(creates, 0);
  tx.chuong.findUnique = async () => null;
  await assert.rejects(storeImportChapter(db, 2, ref, "text", true), /body failed/); assert.equal(transactions, 2);
  tx.chuong.findUnique = async ({ where }) => where.idTruyen_slug ? { idChuong: 99 } : null;
  await assert.rejects(storeImportChapter(db, 2, ref, "text", true), /xung đột/);
});
test("wrong database and invalid input fail closed; cancellation interrupts waits", async () => {
  const saved = process.env.DATABASE_NAME; process.env.DATABASE_NAME = "web_truyen";
  try { await assert.rejects(ensureImportDatabase({ async $queryRaw() { return [{ db: "mydb" }]; } }), /không phải web_truyen/); }
  finally { if (saved === undefined) delete process.env.DATABASE_NAME; else process.env.DATABASE_NAME = saved; }
  assert.ok(!importUrlSchema.safeParse({ url: "not-url", maxChapters: 0 }).success);
  assert.ok(!importUrlSchema.safeParse({ url: "https://example.com", cookie: "secret" }).success);
  const controller = new AbortController(); const promise = pause(10000, controller.signal); controller.abort(); await assert.rejects(promise);
});
test("a public redirect cannot open a private address and socket uses validated IP", async (t) => {
  let calls = 0;
  t.mock.method(http, "request", (options, callback) => {
    calls++; assert.equal(options.hostname, "8.8.8.8");
    const req = new EventEmitter();
    req.end = () => { const res = Readable.from([]); res.statusCode = 302; res.headers = { location: "http://127.0.0.1/secret" }; callback(res); };
    return req;
  });
  await assert.rejects(safeRequest("http://8.8.8.8/story", AbortSignal.timeout(1000)), /nội bộ|dành riêng/);
  assert.equal(calls, 1);
});
test("DNS selection prefers public IPv4 without weakening IPv6/private-address protection", () => {
  assert.equal(selectPublicAddress([{ address: "2606:4700:4700::1111", family: 6 }, { address: "8.8.8.8", family: 4 }]), "8.8.8.8");
  assert.equal(selectPublicAddress([{ address: "2606:4700:4700::1111", family: 6 }]), "2606:4700:4700::1111");
  assert.throws(() => selectPublicAddress([{ address: "8.8.8.8", family: 4 }, { address: "::ffff:127.0.0.1", family: 6 }]));
});
test("LoHi uses the public API, paginates short pages, and respects max chapters", async () => {
  const book = { slug: "kiem-lai", titleVi: "Kiếm Lai", synopsis: "Văn án", authorVi: "Tác Giả", genres: ["Tiên Hiệp"], completionStatus: "ongoing", access: "open", totalChapters: 3, vipFromChapter: 3 };
  const calls = [];
  const client = { async html() { throw Error("LoHi must not rely on generic HTML links"); }, async json(url) {
    calls.push(url);
    if (url.includes("/chapters?")) {
      const offset = Number(new URL(url).searchParams.get("offset"));
      return offset < 3 ? [{ id: String(offset), chapterNumber: offset + 1, titleVi: `Chương ${offset + 1}` }] : [];
    }
    return book;
  } };
  const all = await scrapeStory("https://lohi2.com/truyen/kiem-lai", client);
  assert.equal(all.chapters.length, 3); assert.equal(all.chapters[2].locked, true);
  assert.ok(calls.some(c => c.includes("offset=2")));
  assert.equal((await scrapeStory("https://lohi2.com/truyen/kiem-lai", client, 2)).chapters.length, 2);
  await assert.rejects(scrapeStory("https://lohi2.com/", client), /URL trang truyện/);
});
test("LoHi verifies identity, preserves public text and images, and rejects gated/preview content", async () => {
  const ref = { url: "https://lohi2.com/truyen/kiem-lai/chuong-1", number: 1, title: "Chương 1" };
  const base = { novel: { slug: "kiem-lai" }, chapter: { chapterNumber: 1, content: "Hă´n đến.\n\nĐoạn tiếp." } };
  const parse = data => scrapeChapter(ref, { async json() { return data; } });
  assert.ok((await chapterContent(await parse(base), async () => null)).includes("Hắn đến.\n\nĐoạn tiếp."));
  for (const flag of ["vipLocked", "orbitBuyInLocked", "requiresLogin", "preview", "truncated"]) await assert.rejects(parse({ ...base, [flag]: true }), SourceLockedError);
  for (const flag of ["isVip", "isLocked", "preview", "truncated", "requiresLogin"]) await assert.rejects(parse({ ...base, chapter: { ...base.chapter, [flag]: true } }), SourceLockedError);
  await assert.rejects(parse({ ...base, chapter: { ...base.chapter, chapterNumber: 2 } }), /không khớp/);
  await assert.rejects(parse({ ...base, novel: { slug: "other" } }), /không khớp/);
});
test("diagnostics explain known failures and redact unknown source/database errors", async (t) => {
  assert.match(importErrorMessage(new ImportSourceError("Không tìm thấy mục lục.")), /Không tìm thấy/);
  assert.match(importErrorMessage(Object.assign(Error("credential=secret"), { code: "ECONNRESET" })), /ECONNRESET/);
  const database = Object.assign(Error("SELECT secret FROM private_table"), { code: "P2022" });
  assert.equal(importErrorCode(database), "P2022"); assert.match(importErrorMessage(database), /database.*P2022/i); assert.ok(!importErrorMessage(database).includes("secret"));
  const filesystem = Object.assign(Error("private path"), { code: "EROFS" });
  assert.equal(importErrorCode(filesystem), "EROFS"); assert.match(importErrorMessage(filesystem), /filesystem.*EROFS/i);
  assert.match(importErrorMessage(Error("Không tìm thấy selector #chapter-content")), /selector #chapter-content/);
  assert.ok(!importErrorMessage(Error("SELECT secret FROM private_table token=abc")).includes("secret"));
  assert.match(importErrorMessage(SyntaxError("secret response")), /cấu trúc/);
  const limited = new SourceRateLimitError(429, "30");
  assert.ok(limited instanceof SourceBlockedError); assert.match(importErrorMessage(limited), /30 giây/);
  t.mock.method(http, "request", (_options, callback) => {
    const req = new EventEmitter(); req.end = () => { const res = Readable.from([]); res.statusCode = 429; res.headers = { "retry-after": "30" }; callback(res); }; return req;
  });
  await assert.rejects(safeRequest("http://8.8.8.8/story", AbortSignal.timeout(1000)), SourceBlockedError);
});
