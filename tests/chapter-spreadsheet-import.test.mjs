import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { loadNotificationModule as load } from "./notification-support.mjs";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const spreadsheet = load("lib/server/spreadsheet-upload.ts");
const upload = load("lib/server/upload-size.ts");
const row = (chuongSo, overrides = {}) => ({
  idTruyen: 1, chuongSo, tieuDeChuong: `Chương ${chuongSo}`,
  slug: `chuong-${chuongSo}`, isFree: true, noiDung: `Nội dung ${chuongSo}`, ...overrides,
});

function harness(rows, { missingLookup = false, ambiguousLookup = false, contentWriteFails = false, contentWriteShort = false } = {}) {
  const state = { chapters: [], content: [], storyCounts: new Map() };
  const events = { creates: 0, commits: 0, rollbacks: 0, invalidations: 0 };
  const prisma = {
    truyen: { findMany: async () => [{ idTruyen: 1 }] },
    chuong: { findMany: async () => [] },
    async $transaction(callback) {
      const pending = structuredClone(state);
      const transaction = {
        chuong: {
          async createMany({ data }) {
            events.creates++;
            for (const chapter of data) {
              if (pending.chapters.some((existing) => existing.idTruyen === chapter.idTruyen && existing.slug === chapter.slug)) {
                throw new Error("Duplicate chapter slug");
              }
              pending.chapters.push({ ...chapter, idChuong: pending.chapters.length + 1, chuongSo: Math.round(chapter.chuongSo * 10) / 10 });
            }
            return { count: data.length };
          },
          async findMany() {
            if (missingLookup) return [];
            const found = pending.chapters.map((chapter) => ({
              ...chapter, chuongSo: { toString: () => String(chapter.chuongSo) },
            }));
            return ambiguousLookup ? [...found, ...found] : found;
          },
          count: async ({ where }) => pending.chapters.filter((chapter) => chapter.idTruyen === where.idTruyen).length,
        },
        noiDungChuong: { async createMany({ data }) {
          if (contentWriteFails) throw new Error("Content write failed");
          if (contentWriteShort) return { count: 0 };
          pending.content.push(...data);
          return { count: data.length };
        } },
        truyen: { async update({ where, data }) { pending.storyCounts.set(where.idTruyen, data.soChuong); } },
      };
      try {
        const result = await callback(transaction);
        Object.assign(state, pending);
        events.commits++;
        return result;
      } catch (error) {
        events.rollbacks++;
        throw error;
      }
    },
  };
  const route = load("app/api/admin/chapter/import/route.ts", {
    xlsx: { read: () => ({ SheetNames: ["Chapters"], Sheets: { Chapters: rows } }), utils: { sheet_to_json: (sheet) => sheet } },
    "@/lib/prisma": { prisma },
    "@/lib/server/public-cache": { revalidatePublicStories: () => { events.invalidations++; } },
    "@/lib/api": { resSuccess: (data) => ({ success: true, data }), getRequestId: () => "test-import" },
    "@/lib/server/auth-session": { requireAdmin: async () => ({ authorized: true, user: { idTaiKhoan: 7 } }) },
    "@/lib/server/spreadsheet-upload": spreadsheet,
    "@/lib/server/upload-size": upload,
  }, { Buffer, console: { error() {} } });
  return {
    state, events,
    async post() {
      const form = new FormData();
      form.set("file", new File(["mock workbook bytes"], "chapters.xlsx"));
      const response = await route.POST(new NextRequest("https://example.test/api/admin/chapter/import", { method: "POST", body: form }));
      return { status: response.status, body: await response.json() };
    },
  };
}

test("chapter spreadsheet rejects extra decimal places before inserting rounded metadata", async () => {
  const app = harness([row(1.25)]);
  const { body } = await app.post();
  assert.equal(body.data.insertedRows, 0);
  assert.equal(body.data.errorRows, 1);
  assert.equal(body.data.errors[0].field, "chuongSo");
  assert.equal(app.events.creates, 0);
  assert.equal(app.state.chapters.length, 0);
  assert.equal(app.state.content.length, 0);
});

test("chapter spreadsheet preserves one-decimal and whole chapters with their trimmed content", async () => {
  const app = harness([row(" 1.2 ", { noiDung: "  Một nội dung  \n" }), row(2)]);
  const { status, body } = await app.post();
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.insertedRows, 2);
  assert.equal(body.data.errorRows, 0);
  assert.deepEqual(app.state.chapters.map(({ chuongSo }) => chuongSo), [1.2, 2]);
  assert.deepEqual(app.state.content.map(({ idChuong, noiDung }) => ({ idChuong, noiDung })), [
    { idChuong: 1, noiDung: "Một nội dung" }, { idChuong: 2, noiDung: "Nội dung 2" },
  ]);
  assert.equal(app.state.storyCounts.get(1), 2);
  assert.equal(app.events.invalidations, 1);
});

for (const options of [{ missingLookup: true }, { ambiguousLookup: true }, { contentWriteFails: true }, { contentWriteShort: true }]) {
  test(`chapter import rolls back metadata when content cannot be saved exactly once (${JSON.stringify(options)})`, async () => {
    const app = harness([row(1.2)], options);
    const { status, body } = await app.post();
    assert.equal(status, 500);
    assert.equal(body.success, false);
    assert.equal(body.data?.insertedRows, undefined);
    assert.equal(app.events.rollbacks, 1);
    assert.equal(app.events.commits, 0);
    assert.equal(app.state.chapters.length, 0);
    assert.equal(app.state.content.length, 0);
    assert.equal(app.events.invalidations, 0);
  });
}

test("duplicate chapter numbers are reported and whitespace-only bodies stay empty", async () => {
  const app = harness([row(1, { noiDung: " \n\t " }), row("1.0", { slug: "duplicate" })]);
  const { body } = await app.post();
  assert.equal(body.data.insertedRows, 1);
  assert.equal(body.data.errorRows, 1);
  assert.equal(body.data.errors[0].field, "chuongSo");
  assert.equal(app.state.chapters.length, 1);
  assert.equal(app.state.content.length, 0);
});

test("conflicting chapter slugs roll back the whole import", async () => {
  const app = harness([row(1, { slug: "same-slug" }), row(2, { slug: "same-slug" })]);
  const { status, body } = await app.post();
  assert.equal(status, 500);
  assert.equal(body.success, false);
  assert.equal(app.events.rollbacks, 1);
  assert.equal(app.state.chapters.length, 0);
  assert.equal(app.state.content.length, 0);
});

 test("chapter spreadsheet enforces Decimal(7,1) bounds", async () => {
  const app = harness([row(999999.9), row(1000000), row(0), row(-1), row(1.01)]);
  const { status, body } = await app.post();
  assert.equal(status, 200);
  assert.equal(body.data.insertedRows, 1);
  assert.equal(body.data.errorRows, 4);
  assert.equal(app.state.chapters[0].chuongSo, 999999.9);
});
