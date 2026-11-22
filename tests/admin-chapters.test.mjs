import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { loadNotificationModule as load } from "./notification-support.mjs";
const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require("next/server");
const schema = load("schemas/admin-chapters.schema.ts");
const runtime = require("@prisma/client/runtime/client");
const Prisma = { empty: runtime.empty, sql: runtime.sqltag, join: runtime.join, TransactionIsolationLevel: { RepeatableRead: "RepeatableRead" } };
const plain = (value) => JSON.parse(JSON.stringify(value));
const text = load("lib/vietnamese-text.ts");
export function service(db) { return load("lib/server/admin-chapters.ts", { "@/lib/prisma": { prisma: db }, "@/app/generated/prisma/client": { Prisma }, "@/lib/vietnamese-text": text, "@/schemas/admin-chapters.schema": schema }); }

test("chapter query validates filters, bounded pagination, sorts and numeric search ranges", () => {
  for (const value of [{ page: "0" }, { limit: "101" }, { vipFilter: "paid" }, { shortOnly: "yes" }, { sortBy: "content" }, { storyId: "invalid" }, { q: "a".repeat(201) }]) assert.equal(schema.adminChaptersQuerySchema.safeParse(value).success, false);
  assert.deepEqual(plain(schema.parseChapterNumberSearch("10-20")), { from: 10, to: 20 });
  assert.deepEqual(plain(schema.parseChapterNumberSearch("10.5")), { from: 10.5, to: 10.5 });
  assert.equal(schema.parseChapterNumberSearch("20-10"), null);
  for (const value of [{ action: "set-vip", chapterIds: [1], giaXu: 0 }, { action: "set-vip", chapterIds: [1], giaXu: 1.5 }, { action: "delete", chapterIds: [] }, { action: "set-free", chapterIds: ["1"] }, { action: "delete", chapterIds: Array(101).fill(1) }]) assert.equal(schema.chapterBulkSchema.safeParse(value).success, false);
  assert.deepEqual(plain(schema.chapterBulkSchema.parse({ action: "set-vip", chapterIds: [1, 1, 2], giaXu: 5 }).chapterIds), [1, 2]);
});

test("count and preview normalize Vietnamese NFC and handle empty/Unicode whitespace", () => {
  const s = service({});
  const content = "Tiếng\u00a0Việt\n\tchương\u200bmới";
  assert.equal(s.chapterText(content).normalize("NFC"), s.chapterText(content));
  assert.equal(s.countChapterWords(content), 4);
  assert.equal(s.countChapterWords(" \n\t\u200b "), 0);
});

test("list computes counts and filters before pagination without returning full content", async () => {
  const queries = [], metadata = [];
  const tx = {
    $queryRaw: async (query) => { queries.push(query); return query.sql.startsWith("SELECT COUNT") ? [{ total: 45n }] : [{ idChuong: 3, wordCount: 98n, total: 45n }]; },
    chuong: { findMany: async (args) => { metadata.push(args); return [{ idChuong: 3 }]; } },
  };
  const s = service({ $transaction: async (fn) => fn(tx) });
  const result = await s.listAdminChapters(schema.adminChaptersQuerySchema.parse({ q: "10-20", vipFilter: "vip", shortOnly: "true", sortBy: "wordCount", storyId: "2", page: "2" }));
  assert.equal(result.data[0].wordCount, 98);
  assert.equal(result.meta.totalPage, 3);
  assert.match(queries[0].sql, /chuong_so BETWEEN/);
  assert.match(queries[0].sql, /gia_xu > 0/);
  assert.match(queries[0].sql, /REGEXP_REPLACE/);
  assert.equal(queries[0].sql.match(/REGEXP_REPLACE/g).length, 1);
  assert.match(queries[0].sql, /COUNT\(\*\) OVER\(\)/);
  assert.equal(queries.length, 1, "expensive count pass must be shared with total pagination count");
  assert.deepEqual(queries[0].values.slice(-2), [20, 20]);
  assert.equal(metadata[0].select.noiDungChuong, undefined);
});

test("ordinary list pages select IDs without scanning content, then count only that page", async () => {
  const queries = [];
  const tx = {
    $queryRaw: async (query) => {
      queries.push(query);
      if (query.sql.startsWith("SELECT COUNT")) return [{ total: 2508n }];
      if (query.sql.includes("FROM noi_dung_chuong n")) return [{ idChuong: 3, wordCount: 2450n }];
      return [{ idChuong: 3 }, { idChuong: 4 }];
    },
    chuong: { findMany: async () => [{ idChuong: 3 }, { idChuong: 4 }] },
  };
  const s = service({ $transaction: async (fn) => fn(tx) });
  const result = await s.listAdminChapters(schema.adminChaptersQuerySchema.parse({}));
  assert.doesNotMatch(queries[0].sql, /REGEXP_REPLACE|noi_dung_chuong/);
  assert.doesNotMatch(queries[1].sql, /REGEXP_REPLACE|noi_dung_chuong/);
  assert.match(queries[2].sql, /WHERE n.idCHUONG IN/);
  assert.deepEqual(queries[2].values.slice(-2), [3, 4]);
  assert.equal(result.data[0].wordCount, 2450);
  assert.equal(result.data[1].wordCount, 0);
  assert.equal(result.meta.total, 2508);
});

test("API rejects unauthorized and malformed bulk requests before mutations", async () => {
  let authorized = false, calls = 0;
  const s = service({});
  const route = load("app/api/admin/chapters/bulk/route.ts", {
    "@/schemas/admin-chapters.schema": schema, "@/lib/server/admin-chapters": { ...s, mutateChapters: async () => { calls++; return { count: 1 }; } },
    "@/lib/server/auth-session": { requireAdmin: async () => authorized ? { authorized: true } : { authorized: false, response: NextResponse.json({}, { status: 403 }) } },
  });
  const req = (body, origin = "http://local.test") => new NextRequest("http://local.test/api/admin/chapters/bulk", { method: "POST", headers: { "content-type": "application/json", origin }, body });
  assert.equal((await route.POST(req('{}'))).status, 403); authorized = true;
  for (const body of ["{", '{}', '{"action":"set-vip","chapterIds":[1],"giaXu":0}']) assert.equal((await route.POST(req(body))).status, 400);
  assert.equal((await route.POST(req('{"action":"delete","chapterIds":[1]}', "http://evil.test"))).status, 403);
  assert.equal(calls, 0);
});
