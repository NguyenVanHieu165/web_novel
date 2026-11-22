import assert from "node:assert/strict";
import test from "node:test";
import { initialData, chapterBody, cleanText, key, NameRegistry, storeChapter } from "../scripts/crawl-truyendocviet.ts";

function page(chapter) {
  return `<script>window.__INITIAL_DATA__ = ${JSON.stringify({ PageData: { chapterInfo: chapter } })}</script>`;
}
const base = { _id: "7", BookId: "9", ContentOrder: 1, ContentTitle: "Chương 1", Description: "Nội dung tiếng Việt đầy đủ. ".repeat(30) };

test("initial data is parsed as JSON without executing source scripts", () => {
  assert.deepEqual(initialData('<script>window.__INITIAL_DATA__ = {"hello":1};</script>'), { hello: 1 });
  assert.throws(() => initialData('<script>window.__INITIAL_DATA__ = process.exit();</script>'));
});
test("public body rejects teaser/security gate/VIP and wrong resource identity", () => {
  for (const flag of ["GuestTeaser", "IsSecurityGate", "IsVip", "IsLocked"]) assert.equal(chapterBody(page({ ...base, [flag]: true }), "9", "7"), null);
  assert.throws(() => chapterBody(page(base), "10", "7"), /identity mismatch/);
  assert.equal(chapterBody(page({ ...base, Description: "" }), "9", "7"), null);
  assert.equal(chapterBody(page(base), "9", "7").content, base.Description.trim());
});
test("cleaning preserves Vietnamese text and paragraphs but drops executable markup and watermark", () => {
  assert.equal(cleanText('<p>Hă´n luô`ng</p><script>alert(1)</script><style>bad</style>\nĐọc tại truyendocviet1.shop\n<p>Cuối.</p>'), 'Hắn luồng\n\nCuối.');
});
test("metadata registry reuses IDs across case, accents, NFC/NFD, and whitespace", () => {
  const registry = new NameRegistry();
  registry.add("Tiên Hiệp", 3);
  registry.add("tiên hiệp", 99);
  assert.equal(registry.get("  Tiên   hiệp ".normalize("NFD")), 3);
  assert.equal(registry.get("tien hiep"), 3);
  assert.equal(key("Đô Thị"), "do-thi");
});
test("chapter and body are atomic; existing content is not overwritten", async () => {
  let creates = 0, bodies = 0;
  const existing = { idChuong: 8, isDeleted: false, noiDungChuong: { noiDung: "original" } };
  const tx = { chuong: { async findUnique() { return existing; }, async create() { creates++; } }, noiDungChuong: { async upsert() { bodies++; } } };
  const db = { async $transaction(work) { return work(tx); } };
  assert.equal(await storeChapter(db, 1, base, "replacement"), false);
  assert.equal(creates + bodies, 0);
  tx.chuong.findUnique = async () => null;
  tx.chuong.create = async () => { creates++; return { idChuong: 8 }; };
  tx.noiDungChuong.upsert = async () => { throw new Error("body failed"); };
  await assert.rejects(storeChapter(db, 1, base, "replacement"), /body failed/);
});
