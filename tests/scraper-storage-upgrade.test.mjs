import assert from "node:assert/strict";
import test from "node:test";
import { metadataKey, nameKey } from "../lib/scraper/normalizer.ts";
import { createImportStoryWithChapter, findImportStory, storeImportChapter } from "../lib/scraper/storage.ts";

const ref = { number: 1, title: "Chương 1", url: "https://example.com/book/chapter-1" };
const story = { title: "Truyện mới", slug: "truyen-moi", description: "Văn án", authors: [], genres: [], views: 0, completed: false, chapters: [ref] };

function database({ failBody = false, initial = {} } = {}) {
  let state = { stories: [], chapters: [], bodies: [], genres: [], authors: [], genreJoins: [], authorJoins: [], ...structuredClone(initial) };
  let transactions = 0;
  const tx = {
    async $queryRaw() { return []; },
    truyen: {
      async create({ data }) { const row = { idTruyen: 20, ...data, isDeleted: false }; state.stories.push(row); return row; },
      async update({ where, data }) { const row = state.stories.find(s => s.idTruyen === where.idTruyen); Object.assign(row, data); return row; },
    },
    theLoai: {
      async findMany() { return state.genres; },
      async create({ data }) { const row = { idTheLoai: 50 + state.genres.length, ...data }; state.genres.push(row); return row; },
    },
    tacGiaDich: {
      async findMany() { return state.authors; },
      async create({ data }) { const row = { idTacGiaDich: 100 + state.authors.length, ...data }; state.authors.push(row); return row; },
    },
    truyenTheLoai: { async upsert({ create }) { if (!state.genreJoins.some(j => j.idTruyen === create.idTruyen && j.idTheLoai === create.idTheLoai)) state.genreJoins.push(create); } },
    truyen_tac_gia_dich: { async create({ data }) { state.authorJoins.push(data); } },
    chuong: {
      async findUnique({ where }) {
        const key = where.idTruyen_chuongSo;
        const row = key ? state.chapters.find(c => c.idTruyen === key.idTruyen && c.chuongSo === key.chuongSo) : state.chapters.find(c => c.idTruyen === where.idTruyen_slug.idTruyen && c.slug === where.idTruyen_slug.slug);
        return row ? { ...row, noiDungChuong: state.bodies.find(b => b.idChuong === row.idChuong) ?? null } : null;
      },
      async create({ data }) { const row = { idChuong: 30 + state.chapters.length, isDeleted: false, ...data }; state.chapters.push(row); return row; },
      async update({ where, data }) { const row = state.chapters.find(c => c.idChuong === where.idChuong); Object.assign(row, data); return row; },
    },
    noiDungChuong: { async upsert({ where, create, update }) {
      if (failBody) throw Error("body write failed");
      const row = state.bodies.find(b => b.idChuong === where.idChuong);
      if (row) Object.assign(row, update); else state.bodies.push(create);
    } },
  };
  return {
    get state() { return state; },
    get transactions() { return transactions; },
    async $transaction(work) {
      transactions++;
      const before = structuredClone(state);
      try { return await work(tx); } catch (error) { state = before; throw error; }
    },
  };
}

test("metadata identity retains non-Latin names and Vietnamese slug compatibility", () => {
  assert.equal(metadataKey(" Tiên  Hiệp ".normalize("NFD")), metadataKey("tien hiep"));
  assert.notEqual(metadataKey("仙侠"), metadataKey("武侠"));
  assert.notEqual(metadataKey("作者 甲"), metadataKey("作者 乙"));
  assert.notEqual(metadataKey("武侠 A"), metadataKey("仙侠 A"));
  assert.notEqual(metadataKey("❤"), metadataKey("★"));
  assert.equal(nameKey("Tiên Hiệp"), "tien-hiep");
  assert.equal(nameKey("仙侠"), "", "ASCII filename slugs stay separate from metadata identity");
});

test("story lookup does not adopt an unrelated non-Latin title", async () => {
  const db = { truyen: { async findFirst() { return null; }, async findMany() { return [{ idTruyen: 1, tenTruyen: "武侠", slug: "old", anhBia: "", isDeleted: false }]; } } };
  assert.equal(await findImportStory(db, { ...story, title: "仙侠" }, "https://example.com/new"), null);
});

test("skipExisting repairs missing, null and whitespace chapter bodies without changing chapter ID/paywall", async () => {
  for (const body of [null, "", "   "]) {
    const initial = { chapters: [{ idChuong: 10, idTruyen: 2, chuongSo: 1, slug: "old-1", isDeleted: false, isFree: false, giaXu: 5 }], bodies: body === null ? [] : [{ idChuong: 10, noiDung: body }] };
    const db = database({ initial });
    assert.equal(await storeImportChapter(db, 2, ref, " Nội dung mới ", true), true);
    assert.equal(db.state.chapters.length, 1);
    assert.equal(db.state.chapters[0].idChuong, 10);
    assert.equal(db.state.chapters[0].giaXu, 5);
    assert.equal(db.state.chapters[0].isFree, false);
    assert.equal(db.state.bodies[0].noiDung, "Nội dung mới");
  }
  const db = database({ initial: { chapters: [{ idChuong: 10, idTruyen: 2, chuongSo: 1, slug: "old-1", isDeleted: false }], bodies: [{ idChuong: 10, noiDung: "Original" }] } });
  assert.equal(await storeImportChapter(db, 2, ref, "Replacement", true), false);
  assert.equal(db.state.bodies[0].noiDung, "Original");
});

test("first chapter/body failure rolls back new story, metadata and joins in one transaction", async () => {
  const db = database({ failBody: true });
  await assert.rejects(createImportStoryWithChapter(db, { ...story, genres: ["Genre"], authors: ["Author"] }, "https://example.com/book", "/cover.webp", ref, "Chapter content"), /body write failed/);
  assert.equal(db.transactions, 1);
  assert.deepEqual(db.state, { stories: [], chapters: [], bodies: [], genres: [], authors: [], genreJoins: [], authorJoins: [] });
});

test("first story and body commit together while reusing normalized metadata IDs", async () => {
  const db = database({ initial: { genres: [{ idTheLoai: 1, tenTheLoai: "Tiên Hiệp" }, { idTheLoai: 2, tenTheLoai: "仙侠" }], authors: [{ idTacGiaDich: 10, ten: "Tác Giả" }, { idTacGiaDich: 11, ten: "作者 甲" }] } });
  const row = await createImportStoryWithChapter(db, { ...story, genres: ["tiên hiệp".normalize("NFD"), "Tiên Hiệp", "仙侠", "武侠"], authors: ["Tác Giả", "tác giả", "作者 甲", "作者 乙"] }, "https://example.com/book", "/cover.webp", ref, "Full body");
  assert.equal(db.transactions, 1); assert.equal(row.idTruyen, 20);
  assert.equal(db.state.stories[0].soChuong, 1);
  assert.equal(db.state.chapters.length, 1); assert.equal(db.state.bodies[0].noiDung, "Full body");
  assert.equal(db.state.genres.length, 3); assert.equal(db.state.authors.length, 3);
  assert.equal(db.state.genreJoins.length, 3); assert.equal(db.state.authorJoins.length, 3);
});

test("empty input never inserts a chapter or body", async () => {
  const db = database();
  await assert.rejects(storeImportChapter(db, 2, ref, " \n ", true), /rỗng/);
  assert.equal(db.state.chapters.length, 0); assert.equal(db.state.bodies.length, 0);
});
