import assert from "node:assert/strict";
import test from "node:test";
import { cleanContent, originalCoverUrl, chapterNumber, publicChapter, authenticatedChapter, orderedChapterList, sourceHeaders, sourceRedirectBlocked, message, saveChapter, walkChapterPages, guestChapter, retryDelay } from "../scripts/crawl-stories.ts";
import { encryptSource, decryptSource, normalizeVietnamese } from "../scripts/crawl-source-codec.ts";

test("crawler strips ads, scripts and hidden text while preserving Vietnamese paragraphs", () => {
  assert.equal(cleanContent('<p>Đoạn một &amp; hai.</p><script>evil()</script><style>bad</style><div class="adsbygoogle">Mua ngay</div><p hidden>Rác</p><p>Đoạn &quot;ba&quot; &#x1F600;.</p>'), 'Đoạn một & hai.\n\nĐoạn "ba" 😀.');
});

test("crawler decodes optimizer covers and refuses unexpected hosts", () => {
  assert.equal(originalCoverUrl('/_next/image?url=https%3A%2F%2Fcms.metruyen.com%2Fstorage%2Fuploads%2Fa.webp&amp;w=640'), 'https://cms.metruyen.com/storage/uploads/a.webp');
  assert.throws(() => originalCoverUrl('http://127.0.0.1/cover'), /Unexpected cover host/);
});

test("crawler preserves decimal chapter numbers and rejects schema overflow", () => {
  assert.equal(chapterNumber('Chương 12,5: Ngoại truyện', 1), 12.5);
  assert.equal(chapterNumber('Mở đầu', 0), 0);
  assert.throws(() => chapterNumber('Mở đầu', 1000000), /Invalid chapter/);
});

function page(pageProps) {
  return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps } })}</script>`;
}

test("crawler refuses login-restricted bodies instead of saving placeholders", () => {
  assert.throws(() => publicChapter(page({ story: { id: 1, lock: 'login' }, notify: 'not_login', chapter: { content: 'U2FsdGVkX1...' } })), /ACCESS_BLOCKED: story lock=login/);
});

test("crawler refuses encrypted and paid bodies, accepts a complete public chapter", () => {
  const base = { story: { id: 1 }, chapter: { title: 'Chương 1', slug: 'chuong-1', chapter_order: 1, content: 'U2FsdGVkX1...' } };
  assert.throws(() => publicChapter(page(base)), /ACCESS_BLOCKED: source returned encrypted/);
  assert.throws(() => publicChapter(page({ ...base, chapter: { ...base.chapter, fee: 5 } })), /paid source chapter/);
  const content = 'Nội dung tiếng Việt đầy đủ. '.repeat(30);
  const parsed = publicChapter(page({ ...base, chapter: { ...base.chapter, content: `<p>${content}</p>` }, chapterRight: { id: 2, title: 'Chương 2', slug: 'chuong-2', chapter_order: 2 } }));
  assert.equal(parsed.content, content.trim());
  assert.equal(parsed.next.slug, 'chuong-2');
});

test("authentication headers stay on the source origin and errors redact credentials", () => {
  const cookie = process.env.CRAWL_SOURCE_COOKIE;
  const token = process.env.CRAWL_SOURCE_TOKEN;
  try {
    process.env.CRAWL_SOURCE_COOKIE = "token=fixture-cookie";
    process.env.CRAWL_SOURCE_TOKEN = "Bearer fixture-jwt";
    assert.equal(sourceHeaders("https://lacatruyen.email/api/chapters/list-chapters").Cookie, "token=fixture-cookie");
    assert.equal(sourceHeaders("https://lacatruyen.email/chapter/example").Authorization, "Bearer fixture-jwt");
    assert.equal(sourceHeaders("https://cms.metruyen.com/storage/uploads/a.webp").Cookie, undefined);
    assert.equal(sourceHeaders("https://lacatruyen.email.evil.example/").Authorization, undefined);
    assert.equal(sourceHeaders("https://lacatruyen.email/api/chapters/list-chapters", true).Cookie, undefined);
    assert.equal(sourceHeaders("https://lacatruyen.email/chapter/one", true).Authorization, undefined);
    assert.doesNotMatch(message(new Error("token=fixture-cookie Bearer fixture-jwt fixture-jwt")), /fixture/);
  } finally {
    if (cookie === undefined) delete process.env.CRAWL_SOURCE_COOKIE; else process.env.CRAWL_SOURCE_COOKIE = cookie;
    if (token === undefined) delete process.env.CRAWL_SOURCE_TOKEN; else process.env.CRAWL_SOURCE_TOKEN = token;
  }
});

test("chapter list sorts source rows and refuses a list starting at a late chapter", () => {
  const one = { id: 1, title: "Chương 1", slug: "one", chapter_order: 1 };
  const two = { id: 2, title: "Chương 2", slug: "two", chapter_order: 2 };
  assert.deepEqual(orderedChapterList([two, one, one]), [one, two]);
  assert.throws(() => orderedChapterList([two]), /does not start/);
  assert.equal(orderedChapterList([{ ...one, chapter_order: 775 }])[0].chapter_order, 775);
});

function authorizedPage({ notify = "success", lock = "login", fee = 0, fallbackContent = false, missingIndex = false } = {}) {
  const wireKey = missingIndex ? "undefined" : "wire-fixture";
  const contentKey = "body-fixture";
  const raw = "<p>" + "Văn bản chương sạch. ".repeat(30) + "</p><script>advert()</script>";
  const encryptedBody = encryptSource(raw, contentKey);
  const fields = { id: "1", id_story: "22", title: "Chương 1", slug: "one", chapter_order: "1", fee: String(fee), key_encrypt: encryptSource(contentKey, wireKey), content: fallbackContent ? "" : encryptedBody };
  const chapter = Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, encryptSource(value, wireKey)]));
  return page({ notify, story: { id: 22, lock }, rs: { 0: encryptSource(wireKey) }, ri: encryptSource(missingIndex ? "991" : "0"), comment_count: [], chapter, contentEncrypt: fallbackContent ? encryptedBody : undefined });
}

test("authorized transport handles both content fields and cleans the entire body", () => {
  for (const fallbackContent of [false, true]) {
    const parsed = authenticatedChapter(authorizedPage({ fallbackContent }));
    assert.equal(parsed.content, "Văn bản chương sạch. ".repeat(30).trim());
    assert.equal(parsed.chapter.id_story, 22);
    assert.equal(parsed.chapter.chapter_order, 1);
  }
  assert.equal(decryptSource(encryptSource("tiếng Việt")), "tiếng Việt");
  assert.equal(authenticatedChapter(authorizedPage({ missingIndex: true })).chapter.id, 1);
  assert.throws(() => decryptSource("not-a-payload"), /Unsupported source/);
});

test("authorization and lock checks run before decoding any chapter body", () => {
  assert.throws(() => authenticatedChapter(authorizedPage({ lock: "all" })), /lock=all/);
  assert.throws(() => authenticatedChapter(authorizedPage({ notify: "not_login" })), /did not authorize/);
  assert.throws(() => authenticatedChapter(authorizedPage({ fee: 5 })), /paid source chapter/);
});

test("source access redirects stop collection without following them or forwarding credentials", () => {
  for (const location of ["/banned", "/login", "https://other.example/read", "/auth/signin"]) {
    assert.equal(sourceRedirectBlocked("https://lacatruyen.email/chapter/one", new Response(null, { status: 307, headers: { location } })), true);
  }
  assert.equal(sourceRedirectBlocked("https://lacatruyen.email/chapter/one", new Response("ok", { status: 200 })), false);
});

test("chapter transaction rolls back metadata if the content write fails", async () => {
  const committed = [];
  const db = { async $transaction(work) {
    const pending = [];
    const result = await work({ chuong: {
      async findUnique() { return null; },
      async create({ data }) { pending.push(data); return { idChuong: 1 }; },
    }, noiDungChuong: { async upsert() { throw new Error("content write failed"); } } });
    committed.push(...pending);
    return result;
  } };
  await assert.rejects(saveChapter(db, 22, { id: 1, title: "Chương 1", slug: "one", chapter_order: 1 }, "complete body"), /content write failed/);
  assert.equal(committed.length, 0);
});

test("Vietnamese text composes NFC and repairs spacing acute without changing standalone punctuation", () => {
  assert.equal(normalizeVietnamese("trô´ng"), "trống");
  assert.equal(normalizeVietnamese("Chương 1: Trống".normalize("NFD")), "Chương 1: Trống");
  assert.equal(normalizeVietnamese("dấu ´ đứng riêng"), "dấu ´ đứng riêng");
  assert.equal(cleanContent("<p>trô´ng</p>"), "trống");
  const decomposed = "Tiếng Việt".normalize("NFD");
  assert.equal(decryptSource(encryptSource(decomposed)), "Tiếng Việt");
  assert.equal(normalizeVietnamese(normalizeVietnamese("trô´ng")), "trống");
});

test("public catalogue continues beyond 15 and through short pages until an empty page", async () => {
  const calls = [];
  const pages = [Array.from({ length: 20 }, (_, i) => i + 1), [21, 22], [23], []];
  const all = [];
  for await (const rows of walkChapterPages(async number => {
    calls.push(number);
    return pages[number - 1].map(id => ({ id, title: `Chương ${id}`, slug: `chapter-${id}`, chapter_order: id }));
  })) all.push(...rows);
  assert.equal(all.length, 23);
  assert.deepEqual(calls, [1, 2, 3, 4]);
});

test("public catalogue reports repeated pagination instead of claiming completion", async () => {
  await assert.rejects(async () => {
    for await (const rows of walkChapterPages(async () => [{ id: 1, title: "Chương 1", slug: "one", chapter_order: 1 }])) assert.equal(rows.length, 1);
  }, /pagination repeated/);
});

test("guest mode refuses story locks even if a payload reports success", () => {
  assert.throws(() => guestChapter(authorizedPage()), /story lock=login/);
  assert.throws(() => guestChapter(authorizedPage({ lock: "all" })), /story lock=all/);
  assert.throws(() => guestChapter(authorizedPage({ lock: "none", notify: "not_login" })), /no public full text/);
});

test("rate limiting backs off at least 3 seconds and respects a longer Retry-After", () => {
  assert.equal(retryDelay(null), 3000);
  assert.equal(retryDelay("1"), 3000);
  assert.equal(retryDelay("10"), 10000);
  assert.equal(retryDelay("invalid"), 3000);
  assert.equal(retryDelay("Wed, 21 Oct 2015 07:28:10 GMT", Date.parse("Wed, 21 Oct 2015 07:28:00 GMT")), 10000);
});
