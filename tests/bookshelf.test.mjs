import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require("next/server");
const compiledRoute = ts.transpileModule(await readFile(
  new URL("../app/api/bookshelf/route.ts", import.meta.url), "utf8",
), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness({ authorized = true, failDatabase = false } = {}) {
  const queries = [];
  const follows = [
    { account: 7, deleted: false, id: 1 },
    { account: 7, deleted: true, id: 2 },
    { account: 99, deleted: false, id: 3 },
  ];
  const filterRows = (where) => follows.filter((row) => row.account === where.idTaiKhoan && row.deleted === where.truyen.isDeleted);
  const prisma = {
    theoDoiTruyen: {
      async findMany(query) {
        queries.push(query);
        if (failDatabase) throw new Error("Internal database details");
        return filterRows(query.where).slice(query.skip, query.skip + query.take).map((row) => ({
          idTheoDoiTruyen: row.id,
          createdAt: new Date("2026-11-19T10:00:00Z"),
          truyen: {
            idTruyen: row.id,
            tenTruyen: "A followed story",
            slug: "a-followed-story",
            anhBia: "https://example.test/cover.jpg",
            anhThumbnail: null,
            trang_thai: "hoan_thanh",
            _count: { chuong: 12 },
            noiDungChuong: "Sensitive full content must never be returned",
            databaseOnly: "private",
          },
        }));
      },
      async count({ where }) { return filterRows(where).length; },
    },
  };
  const routeModule = { exports: {} };
  vm.runInNewContext(compiledRoute, {
    module: routeModule,
    exports: routeModule.exports,
    console: { error() {} },
    require(name) {
      if (name === "@/lib/prisma") return { prisma };
      if (name === "@/lib/server/auth-session") return {
        requireUser: async () => authorized
          ? { authorized: true, user: { idTaiKhoan: 7 } }
          : { authorized: false, response: NextResponse.json({ success: false }, { status: 401 }) },
      };
      return require(name);
    },
  });
  return {
    queries,
    async get(query = "") {
      const response = await routeModule.exports.GET(new NextRequest(`https://webnovel.example/api/bookshelf${query}`));
      return { status: response.status, body: await response.json(), headers: response.headers };
    },
  };
}

test("bookshelf requires a valid session before database reads", async () => {
  const app = harness({ authorized: false });
  assert.equal((await app.get()).status, 401);
  assert.equal(app.queries.length, 0);
});

test("bookshelf reads only the account's visible followed stories", async () => {
  const app = harness();
  const result = await app.get();
  assert.equal(result.status, 200);
  assert.equal(result.body.data.length, 1);
  assert.equal(result.body.data[0].id, 1);
  assert.equal(result.body.meta.total, 1);
  assert.equal(result.body.data[0].story.chapters, 12);
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.equal(app.queries[0].where.idTaiKhoan, 7);
  assert.equal(app.queries[0].where.truyen.isDeleted, false);
});

test("pagination is bounded, stable and does not expose chapter content", async () => {
  const app = harness();
  const result = await app.get("?page=2&limit=10");
  assert.deepEqual(result.body.meta, { page: 2, limit: 10, total: 1, totalPage: 1 });
  assert.equal(app.queries[0].skip, 10);
  assert.equal(app.queries[0].take, 10);
  assert.equal(app.queries[0].orderBy[1].idTheoDoiTruyen, "desc");
  const firstPage = await app.get();
  assert.equal(firstPage.body.data[0].story.noiDungChuong, undefined);
  assert.equal(firstPage.body.data[0].story.databaseOnly, undefined);
  assert.equal(app.queries[0].select.truyen.select.chuong, undefined);
  assert.equal(app.queries[0].select.truyen.select._count.select.chuong.where.isDeleted, false);
});

test("rejects invalid bounds and client-supplied account IDs", async () => {
  const app = harness();
  for (const query of ["?page=0", "?page=abc", "?page=1.5", "?page=1000001", "?limit=0", "?limit=51", "?idTaiKhoan=99"]) {
    assert.equal((await app.get(query)).status, 400);
  }
  assert.equal(app.queries.length, 0);
});

test("database errors return a generic message", async () => {
  const app = harness({ failDatabase: true });
  const result = await app.get();
  assert.equal(result.status, 500);
  assert.equal(result.body.success, false);
  assert.doesNotMatch(JSON.stringify(result.body), /Internal database details/);
});
