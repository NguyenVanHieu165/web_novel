import assert from "node:assert/strict";
import test from "node:test";
import { loadNotificationModule as load } from "./notification-support.mjs";

const text = load("lib/vietnamese-text.ts");
const utils = load("lib/utils.ts", { "./vietnamese-text": text });
const chapter = load("schemas/chapter-schema.ts");
const schemas = load("schemas/chapter-writing.schema.ts", { "./chapter-schema": chapter });
const parser = load("lib/chapter-document-parser.ts", { "./utils": utils, "./vietnamese-text": text }, { Buffer, TextDecoder });
const ownership = load("lib/server/studio-ownership.ts");
const actorA = { idTaiKhoan: 7, roles: ["user"] };
const actorB = { idTaiKhoan: 8, roles: ["user"] };
const value = (number, extra = {}) => ({ idTruyen: 1, chuongSo: number, tieuDeChuong: `Chương ${number}`, slug: `chuong-${number}`, noiDung: "Hắn nắm chặt nắm đấm.\n\nNội dung đầy đủ.", isFree: true, giaXu: 0, publication: "published", ...extra });
function batchValue(input) { const output = { ...input }; delete output.idTruyen; return output; }

function harness({ database = "web_truyen", failContent = false } = {}) {
  let state = {
    chapters: new Map(), registry: new Map([["studio.story.1", JSON.stringify({ version: 1, ownerId: 7, authorId: 1 })]]),
    stories: new Map([[1, { idTruyen: 1, tenTruyen: "Sáng tác", slug: "sang-tac", nguon: "sang_tac", soChuong: 0 }], [2, { idTruyen: 2, tenTruyen: "Truyện khác", slug: "khac", nguon: "dich" }]]), notifications: [],
  };
  const dispatched = [];
  let commits = 0, transactions = 0, inTransaction = false;
  const tx = {
    async $queryRaw(strings, ...values) {
      const sql = strings.join("?");
      if (sql.includes("DATABASE()")) return [{ databaseName: database }];
      if (sql.includes("FOR UPDATE")) return [{ idTRUYEN: values[0] }];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    taiKhoan: { async findFirst({ where }) { return where.idTaiKhoan === 7 ? { idTaiKhoan: 7 } : null; } },
    truyen: {
      async findFirst({ where }) { const story = state.stories.get(where.idTruyen); return story && !story.isDeleted && (!where.nguon || story.nguon === where.nguon) ? story : null; },
      async update({ where, data }) { Object.assign(state.stories.get(where.idTruyen), data); return state.stories.get(where.idTruyen); },
    },
    caiDatHeThong: {
      async findUnique({ where }) { return state.registry.has(where.khoa) ? { giaTri: state.registry.get(where.khoa) } : null; },
      async upsert({ where, create, update }) { const record = state.registry.has(where.khoa) ? update : create; state.registry.set(where.khoa, record.giaTri); return record; },
    },
    chuong: {
      async findUnique({ where }) { return state.chapters.get(where.idChuong) ?? null; },
      async findFirst({ where }) { return [...state.chapters.values()].find((row) => row.idTruyen === where.idTruyen && row.idChuong !== where.idChuong?.not && where.OR.some((term) => term.slug === row.slug || term.chuongSo === row.chuongSo)) ?? null; },
      async create({ data }) {
        const idChuong = state.chapters.size + 1;
        const row = { ...data, idChuong, noiDungChuong: { ...data.noiDungChuong.create } };
        state.chapters.set(idChuong, row);
        if (failContent) throw new Error("Content storage failed");
        return row;
      },
      async update({ where, data }) {
        const row = state.chapters.get(where.idChuong);
        Object.assign(row, { ...data, noiDungChuong: { ...data.noiDungChuong.upsert.update } });
        return row;
      },
      async count({ where }) { return [...state.chapters.values()].filter((row) => row.idTruyen === where.idTruyen && !row.isDeleted).length; },
      async aggregate({ where }) { const rows = [...state.chapters.values()].filter((row) => row.idTruyen === where.idTruyen); return { _max: { chuongSo: rows.length ? Math.max(...rows.map((row) => row.chuongSo)) : null } }; },
    },
  };
  const db = { ...tx, async $transaction(callback) {
    transactions++;
    const before = structuredClone(state);
    inTransaction = true;
    try { const result = await callback(tx); commits++; return result; } catch (error) { state = before; throw error; } finally { inTransaction = false; }
  } };
  const writing = load("lib/server/chapter-writing.ts", {
    "@/schemas/chapter-writing.schema": schemas, "@/lib/chapter-document-parser": parser, "@/lib/utils": utils,
    "./studio-ownership": ownership,
    "./notifications": {
      async createChapterNotifications(_tx, _story, row) { state.notifications.push(row.idChuong); return { idChuong: row.idChuong }; },
      async dispatchNotification(notification) { assert.equal(inTransaction, false, "Socket dispatch runs only after commit"); dispatched.push(notification.idChuong); },
    },
  });
  return { db, writing, get state() { return state; }, get commits() { return commits; }, get transactions() { return transactions; }, dispatched };
}

test("shared writer saves full NFC text and both metadata/body in one transaction for owner", async () => {
  const app = harness();
  const result = await app.writing.saveWritingChapter(app.db, actorA, value(1), "studio");
  assert.equal(result.idChuong, 1);
  assert.equal(result.publication, "published");
  assert.equal(result.noiDungChuong.noiDung, "Hắn nắm chặt nắm đấm.\n\nNội dung đầy đủ.");
  assert.equal(app.state.stories.get(1).soChuong, 1);
  assert.equal(app.commits, 1);
  assert.deepEqual(app.dispatched, [1]);
});

test("drafts stay hidden and notify once on first publication, never on repeated edits or hide/republish", async () => {
  const app = harness();
  await app.writing.saveWritingChapter(app.db, actorA, value(1, { publication: "draft" }), "studio");
  assert.equal(app.state.chapters.get(1).isDeleted, true);
  assert.equal(app.state.stories.get(1).soChuong, 0);
  assert.equal(app.state.notifications.length, 0);
  for (const publication of ["published", "published", "draft", "published"]) {
    await app.writing.saveWritingChapter(app.db, actorA, value(1, { idChuong: 1, publication }), "studio");
  }
  assert.deepEqual(app.dispatched, [1]);
  assert.deepEqual(app.state.notifications, [1]);
  assert.equal(JSON.parse(app.state.registry.get("studio.chapter.1")).notified, true);
});

test("batch import is atomic: conflicts with existing chapter number or slug roll back preceding chapters and notifications", async () => {
  for (const conflict of [value(1), value(9, { slug: "chuong-1" })]) {
    const app = harness();
    await app.writing.saveWritingChapter(app.db, actorA, value(1), "studio");
    const first = batchValue(value(2));
    const second = batchValue(conflict);
    await assert.rejects(app.writing.importWritingChapters(app.db, actorA, { idTruyen: 1, chapters: [first, second] }, "studio"), (error) => error.status === 409);
    assert.equal(app.state.chapters.size, 1);
    assert.equal(app.state.registry.has("studio.chapter.2"), false);
    assert.deepEqual(app.dispatched, [1]);
    assert.deepEqual(app.state.notifications, [1]);
    assert.equal(app.state.stories.get(1).soChuong, 1);
  }
});

test("duplicate normalized slugs/numbers in a batch are rejected before transaction", async () => {
  const app = harness();
  const chapters = [value(1, { slug: "cùng-tên" }), value(2, { slug: "cung-ten" })].map(batchValue);
  await assert.rejects(app.writing.importWritingChapters(app.db, actorA, { idTruyen: 1, chapters }, "studio"), (error) => error.status === 409);
  assert.equal(app.transactions, 0);
  assert.equal(app.state.chapters.size, 0);
});

test("User B cannot write/import or move another author's chapter; admin scope also enforces role", async () => {
  const app = harness();
  await assert.rejects(app.writing.saveWritingChapter(app.db, actorB, value(1), "studio"), (error) => error.status === 403);
  const chapter = batchValue(value(1));
  await assert.rejects(app.writing.importWritingChapters(app.db, actorB, { idTruyen: 1, chapters: [chapter] }, "studio"), (error) => error.status === 403);
  await assert.rejects(app.writing.saveWritingChapter(app.db, actorA, value(1), "admin"), (error) => error.status === 403);
  assert.equal(app.state.chapters.size, 0);
});

test("maxChapter+1 includes hidden chapters and preserves fractional chapter numbers", async () => {
  const app = harness();
  await app.writing.saveWritingChapter(app.db, actorA, value(2.5, { publication: "draft" }), "studio");
  assert.equal(await app.writing.nextWritingChapterNumber(app.db, actorA, 1, "studio"), 3.5);
  const chapter = batchValue(value(3.5));
  const batch = await app.writing.importWritingChapters(app.db, actorA, { idTruyen: 1, chapters: [chapter] }, "studio");
  assert.equal(batch.nextNumber, 4.5);
  assert.equal(batch.imported, 1);
});

test("wrong database and content write failures leave no metadata, content, count or notification changes", async () => {
  const wrong = harness({ database: "mydb" });
  await assert.rejects(wrong.writing.saveWritingChapter(wrong.db, actorA, value(1), "studio"), (error) => error.status === 503);
  assert.equal(wrong.transactions, 0);
  const failed = harness({ failContent: true });
  await assert.rejects(failed.writing.saveWritingChapter(failed.db, actorA, value(1), "studio"), /Content storage failed/);
  assert.equal(failed.state.chapters.size, 0);
  assert.equal(failed.state.notifications.length, 0);
  assert.equal(failed.dispatched.length, 0);
});

test("Studio cannot republish deleted trash or malformed draft markers, including by forged chapter ID", async () => {
  for (const marker of [null, { version: 1, publication: "trashed", notified: true }, { version: 2, publication: "draft", notified: false }]) {
    const app = harness();
    await app.writing.saveWritingChapter(app.db, actorA, value(1, { publication: "draft" }), "studio");
    if (marker === null) app.state.registry.delete("studio.chapter.1");
    else app.state.registry.set("studio.chapter.1", JSON.stringify(marker));
    await assert.rejects(app.writing.saveWritingChapter(app.db, actorA, value(1, { idChuong: 1 }), "studio"), (error) => error.status === 403 && error.code === "CHAPTER_TRASHED");
    assert.equal(app.state.chapters.get(1).isDeleted, true);
    assert.equal(app.dispatched.length, 0);
  }
});

test("invalid publication metadata fails closed and rolls back edits for published chapters", async () => {
  const app = harness();
  await app.writing.saveWritingChapter(app.db, actorA, value(1), "studio");
  app.state.registry.set("studio.chapter.1", JSON.stringify({ version: 1, publication: "published", notified: "false" }));
  await assert.rejects(app.writing.saveWritingChapter(app.db, actorA, value(1, { idChuong: 1, tieuDeChuong: "Changed" }), "studio"), (error) => error.status === 409 && error.code === "PUBLICATION_INVALID");
  assert.equal(app.state.chapters.get(1).tieuDeChuong, "Chương 1");
  assert.deepEqual(app.dispatched, [1]);
});
