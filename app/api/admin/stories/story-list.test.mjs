import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire, registerHooks } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import "dotenv/config";

const require = createRequire(import.meta.url);
const runtime = require("@prisma/client/runtime/client");
const Prisma = { sql: runtime.sqltag, join: runtime.join, empty: runtime.empty, TransactionIsolationLevel: { RepeatableRead: "RepeatableRead" } };
async function load(file, modules = {}) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const current = { exports: {} };
  vm.runInNewContext(compiled, { module: current, exports: current.exports, URLSearchParams, console, require: (name) => name in modules ? modules[name] : require(name) });
  return current.exports;
}
const schema = await load("../../../../schemas/admin-story-query.schema.ts");
const parse = (value) => schema.adminStoryQuerySchema.parse(value);
const plain = (value) => JSON.parse(JSON.stringify(value));

test("query validation rejects malformed numbers, enums and boolean strings", () => {
  for (const value of [{ page: "0" }, { page: "1.2" }, { page: "1e2" }, { page: "100001" }, { limit: "101" }, { genreId: "-1" }, { genreId: "2147483648" }, { vipOnly: "yes" }, { sortBy: "id; DROP TABLE truyen" }, { sortOrder: "DESC" }, { status: "unknown" }, { chapterRange: "20-100" }, { q: "x".repeat(101) }]) {
    assert.equal(schema.adminStoryQuerySchema.safeParse(value).success, false, JSON.stringify(value));
  }
  assert.equal(parse({ search: " old " }).q, "old");
  assert.equal(parse({ q: " new ", search: "old" }).q, "new");
  assert.equal(parse({ vipOnly: "false" }).vipOnly, "false");
});

test("URL serialization preserves filters and pagination and omits defaults", () => {
  const query = parse({ q: "Tiên Hiệp", genreId: "2", status: "dang_ra", vipOnly: "true", chapterRange: "21-100", sortBy: "soChuong", sortOrder: "asc", page: "2", limit: "20" });
  assert.deepEqual(plain(parse(Object.fromEntries(schema.adminStoryQueryParams(query)))), plain(query));
  assert.equal(schema.adminStoryQueryParams(parse({})).toString(), "");
});

function mockDatabase() {
  const queries = [], selects = [], groups = [];
  const db = {
    $queryRaw: async (query) => { queries.push(query); return query.sql.startsWith("SELECT COUNT") ? [{ total: 2n }] : [{ idTruyen: 2 }, { idTruyen: 1 }]; },
    theLoai: { findMany: async () => [{ idTheLoai: 3, tenTheLoai: "Fantasy" }] },
    truyen: { findMany: async (args) => { selects.push(args); return [{ idTruyen: 1, _count: { chuong: 20 } }, { idTruyen: 2, _count: { chuong: 101 } }]; } },
    chuong: { groupBy: async (args) => { groups.push(args); return [{ idTruyen: 2, _count: { _all: 3 } }]; } },
    $transaction: async (fn, options) => { assert.equal(options.isolationLevel, "RepeatableRead"); return fn(db); },
  };
  return { db, queries, selects, groups };
}
async function queryModule(db) {
  return load("story-list-query.ts", { "@/app/generated/prisma/client": { Prisma }, "@/lib/prisma": { prisma: db } });
}

test("SQL filters real counts at every chapter boundary, before LIMIT", async () => {
  const boundaries = { empty: "= 0", "1-20": "BETWEEN 1 AND 20", "21-100": "BETWEEN 21 AND 100", "100+": "> 100" };
  for (const [chapterRange, expression] of Object.entries(boundaries)) {
    const { db, queries } = mockDatabase();
    const queriesApi = await queryModule(db);
    await queriesApi.listAdminStories(parse({ chapterRange, page: "2", limit: "5", sortBy: "soChuong", sortOrder: "asc" }));
    assert.ok(queries[0].sql.includes(`COALESCE(ch.chapter_count, 0) ${expression}`));
    assert.match(queries[0].sql, /WHERE is_deleted = false GROUP BY idTRUYEN/);
    assert.match(queries[0].sql, /ORDER BY COALESCE\(ch.chapter_count, 0\) ASC, t.idTRUYEN ASC/);
    assert.deepEqual(queries[0].values.slice(-2), [5, 5]);
    assert.ok(queries[1].sql.includes(expression));
  }
});

test("result order, active counts, VIP counts and shared predicates stay consistent", async () => {
  const { db, queries, selects, groups } = mockDatabase();
  const queriesApi = await queryModule(db);
  const result = await queriesApi.listAdminStories(parse({ q: "%' OR 1=1 --_", genreId: "3", genre: "Fantasy", status: "dang_ra", vipOnly: "true", sortBy: "soChuong" }));
  assert.deepEqual(plain(result.data.map((story) => [story.idTruyen, story.soChuong, story.soChuongVip])), [[2, 101, 3], [1, 20, 0]]);
  assert.equal(result.meta.total, 2);
  assert.equal(result.meta.totalPage, 1);
  assert.match(queries[0].sql, /author.loai IN \('tac_gia', 'both'\)/);
  assert.match(queries[0].sql, /COALESCE\(ch.vip_count, 0\) > 0/);
  assert.ok(queries[0].values.includes("dang_tien_hanh"));
  assert.ok(queries[0].values.includes("%!%' OR 1=1 --!_%"));
  assert.ok(!queries[0].sql.includes("OR 1=1"));
  assert.deepEqual(plain(selects[0].select._count), { select: { chuong: { where: { isDeleted: false } } } });
  assert.equal(selects[0].select.chuong, undefined);
  assert.deepEqual(plain(groups[0].where), { idTruyen: { in: [2, 1] }, isDeleted: false, isFree: false });
  assert.equal(queries[0].sql.split("ORDER BY")[0].replace("SELECT t.idTRUYEN AS idTruyen", "").trim(), queries[1].sql.replace("SELECT COUNT(*) AS total", "").trim());
});

test("VIP false leaves all stories eligible and default queries skip count aggregation", async () => {
  const { db, queries } = mockDatabase();
  await (await queryModule(db)).listAdminStories(parse({ vipOnly: "false" }));
  assert.doesNotMatch(queries[0].sql, /LEFT JOIN|vip_count|chapter_count/);
});

test("route enforces authorization and rejects repeated or invalid params before querying", async () => {
  const { NextRequest, NextResponse } = require("next/server");
  let authorized = false, calls = 0;
  const route = await load("route.ts", {
    "@/lib/prisma": { prisma: {} },
    "@/lib/api": { getRequestId: () => "test", resSuccess: (data) => ({ success: true, data }) },
    "@/lib/server/auth-session": { requireAdmin: async () => authorized ? { authorized: true } : { authorized: false, response: NextResponse.json({}, { status: 403 }) } },
    "@/schemas/admin-story-query.schema": schema,
    "./story-list-query": { listAdminStories: async () => { calls++; return { data: [], meta: { total: 0 } }; } },
  });
  const request = (query = "") => new NextRequest(`http://localhost/api/admin/stories${query}`);
  assert.equal((await route.GET(request())).status, 403);
  authorized = true;
  for (const query of ["?q=a&q=b", "?limit=0", "?vipOnly=1"]) assert.equal((await route.GET(request(query))).status, 400);
  assert.equal(calls, 0);
  assert.equal((await route.GET(request("?sortBy=soChuong&sortOrder=asc"))).status, 200);
  assert.equal(calls, 1);
});

test("read-only MySQL integration: count ranges, VIP and sorting match returned metadata", { skip: process.env.RUN_ADMIN_STORIES_READONLY_TESTS !== "1" }, async () => {
  const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL?.includes("/generated/prisma/") && !/\.[a-z]+$/i.test(specifier)) return nextResolve(specifier + ".ts", context);
    return nextResolve(specifier, context);
  } });
  const { PrismaClient, Prisma: ActualPrisma } = await import("../../../generated/prisma/client.ts");
  const { PrismaMariaDb } = await import("@prisma/adapter-mariadb");
  const db = new PrismaClient({ adapter: new PrismaMariaDb({ host: process.env.DATABASE_HOST, user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD, database: process.env.DATABASE_NAME, connectionLimit: 3 }) });
  try {
    const queriesApi = await load("story-list-query.ts", { "@/app/generated/prisma/client": { Prisma: ActualPrisma }, "@/lib/prisma": { prisma: db } });
    for (const chapterRange of ["all", "empty", "1-20", "21-100", "100+"]) {
      const result = await queriesApi.listAdminStories(parse({ chapterRange, sortBy: "soChuong", sortOrder: "asc", limit: "5" }));
      const counts = result.data.map((story) => story.soChuong);
      assert.deepEqual(counts, [...counts].sort((a, b) => a - b));
      for (const count of counts) assert.ok(chapterRange === "all" || (chapterRange === "empty" && count === 0) || (chapterRange === "1-20" && count >= 1 && count <= 20) || (chapterRange === "21-100" && count >= 21 && count <= 100) || (chapterRange === "100+" && count > 100));
    }
    const vip = await queriesApi.listAdminStories(parse({ vipOnly: "true", limit: "5" }));
    assert.ok(vip.data.every((story) => story.soChuongVip > 0 && story.soChuongVip <= story.soChuong));
    await queriesApi.listAdminStories(parse({ q: "%'_", genreId: "1", status: "dang_ra" }));
  } finally { await db.$disconnect(); hooks.deregister(); }
});
