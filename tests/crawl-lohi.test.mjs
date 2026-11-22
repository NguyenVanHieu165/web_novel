import assert from "node:assert/strict";
import test from "node:test";
import { chooseBooks, cleanLohiText, publicBody, saveLohiChapter, excludedContentTitle, retryAfterMs } from "../scripts/crawl-lohi.ts";

test("LoHi rejects locked and partial bodies and normalizes full public text", () => {
  const content = "Hă´n nă´m chặt. ".repeat(20);
  for (const flag of ["isVip", "isLocked", "preview", "truncated", "requiresLogin"]) assert.equal(publicBody({ content, [flag]: true }), null);
  assert.equal(publicBody({ content: null }), null);
  assert.equal(publicBody({ titleVi: "  Hă´n ", content }).title, "Hắn");
  assert.equal(publicBody({ content }).content, "Hắn nắm chặt. ".repeat(20).trim());
  assert.equal(cleanLohiText("<p>Nội dung.</p><script>bad</script>\nhttps://lohi2.com\n<style>bad</style>"), "Nội dung.");
});
test("selection puts 15 complete books first and excludes duplicate normalized titles and existing DB stories", () => {
  const pool = Array.from({ length: 130 }, (_, i) => ({ id: String(i), slug: `s-${i}`, titleVi: `Truyện ${i}`, coverImageUrl: "https://image.lohi2.com/cover.jpg", totalChapters: i + 1, access: "open", completionStatus: i % 2 ? "ongoing" : "completed", genres: [i % 2 ? "Tiên Hiệp" : "Ngôn Tình"] }));
  pool.push({ ...pool[0], id: "duplicate", slug: "duplicate", titleVi: pool[0].titleVi.normalize("NFD") });
  const picked = chooseBooks(pool, new Set(["s-2"]));
  assert.equal(picked.length, 110);
  assert.ok(picked.slice(0, 15).every(b => b.completionStatus === "completed"));
  assert.ok(!picked.some(b => b.slug === "s-2"));
  assert.equal(new Set(picked.map(b => b.titleVi.normalize("NFC"))).size, 110);
  assert.ok(picked.some(b => b.genres.includes("Tiên Hiệp")));
  assert.ok(excludedContentTitle("[Cao H] Example"));
  assert.ok(!excludedContentTitle("Tiên Hiệp"));
});
test("chapter writes use a transaction and preserve existing content; failures propagate", async () => {
  let writes = 0;
  const tx = { chuong: { async findUnique() { return { idChuong: 8, noiDungChuong: { noiDung: "original" } }; }, async create() { writes++; return { idChuong: 9 }; } }, noiDungChuong: { async upsert() { throw Error("body write failed"); } } };
  const db = { async $transaction(work) { return work(tx); } };
  const ref = { id: "00000000-0000-4000-8000-000000000001", chapterNumber: 1 };
  assert.equal(await saveLohiChapter(db, 1, ref, { title: "Title", content: "replacement" }), false);
  assert.equal(writes, 0);
  tx.chuong.findUnique = async () => null;
  await assert.rejects(saveLohiChapter(db, 1, ref, { title: "Title", content: "body" }), /body write failed/);
});
test("backoff honors HTTP and JSON Retry-After without shortening server cooldown", () => {
  assert.equal(retryAfterMs(null, { details: { retryAfter: 36 } }), 36000);
  assert.equal(retryAfterMs("60", { details: { retryAfter: 36 } }), 60000);
  assert.equal(retryAfterMs(null, null), 3000);
});
