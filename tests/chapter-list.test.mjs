import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
async function compile(path) {
  return ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
function load(source, replacements = {}) {
  const routeModule = { exports: {} };
  vm.runInNewContext(source, {
    module: routeModule, exports: routeModule.exports,
    console: { error() {} },
    require(name) { return replacements[name] ?? require(name); },
  });
  return routeModule.exports;
}
const schemas = load(await compile("../lib/chapter-list.ts"));
const route = await compile("../app/api/truyen/[slug]/chapters/route.ts");

function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return value.every((part) => matches(row, part));
    if (key === "OR") return value.some((part) => matches(row, part));
    if (value !== null && typeof value === "object") {
      return Object.entries(value).every(([operator, expected]) => {
        if (operator === "equals") return Number(row[key]) === Number(expected);
        if (operator === "lt") return Number(row[key]) < Number(expected);
        if (operator === "gt") return Number(row[key]) > Number(expected);
        if (operator === "contains") return String(row[key]).toLowerCase().includes(expected.toLowerCase());
        throw new Error(`Unexpected filter ${operator}`);
      });
    }
    return row[key] === value;
  });
}

function harness({ fail = false, visible = true, user = null, purchased = [] } = {}) {
  const queries = [];
  const rows = Array.from({ length: 125 }, (_, index) => ({
    idChuong: index + 1, idTruyen: 1, chuongSo: index + 1,
    slug: `chuong-${index + 1}`, tieuDeChuong: `Chương ${index + 1}`,
    isDeleted: false, isFree: index % 2 === 0, giaXu: index % 2 === 0 ? 0 : 10,
    updatedAt: "2026-11-20T00:00:00Z", noiDung: "Private chapter content",
  }));
  rows.push({ ...rows[0], idChuong: 1000, chuongSo: 999, isDeleted: true });
  rows.push({ ...rows[0], idChuong: 1001, idTruyen: 2 });
  const prisma = {
    chuongDaMua: { async findMany(query) { queries.push({ model: "purchases", ...query }); return purchased.filter((id) => query.where.idChuong.in.includes(id)).map((idChuong) => ({ idChuong })); } },
    truyen: { async findFirst(query) {
      queries.push({ model: "story", ...query });
      if (fail) throw new Error("Internal DB credentials must not escape");
      return visible ? { idTruyen: 1 } : null;
    } },
    chuong: {
      async count(query) { queries.push({ model: "count", ...query }); return rows.filter((row) => matches(row, query.where)).length; },
      async findFirst(query) { queries.push({ model: "anchor", ...query }); return rows.find((row) => matches(row, query.where)) ?? null; },
      async findMany(query) {
        queries.push({ model: "chapters", ...query });
        return rows.filter((row) => matches(row, query.where)).sort((a, b) => {
          for (const sort of query.orderBy) {
            const [key, direction] = Object.entries(sort)[0];
            const comparison = Number(a[key]) - Number(b[key]);
            if (comparison) return direction === "asc" ? comparison : -comparison;
          }
          return 0;
        }).slice(query.skip, query.skip + query.take).map((row) => Object.fromEntries(
          Object.keys(query.select).map((key) => [key, row[key]]),
        ));
      },
    },
  };
  const handler = load(route, { "@/lib/prisma": { prisma }, "@/lib/chapter-list": schemas, "@/lib/server/auth-session": { requireUser: async () => user ? { authorized: true, user } : { authorized: false } } });
  return { rows, queries, async request(query = "") {
    const response = await handler.GET(new NextRequest(`https://webnovel.example/api/truyen/sample/chapters${query}`, user ? { headers: { cookie: "token=test" } } : {}), {
      params: Promise.resolve({ slug: "sample" }),
    });
    return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
  } };
}

test("chapter list reads bounded public metadata without content and stable order", async () => {
  const app = harness();
  const response = await app.request();
  assert.equal(response.status, 200);
  assert.equal(response.body.data.length, 50);
  assert.equal(response.body.meta.total, 125);
  assert.equal(response.body.meta.page, 1);
  assert.equal(response.cache, "no-store");
  assert.equal(response.body.data.some((row) => "noiDung" in row || "noiDungChuong" in row), false);
  assert.equal(schemas.chapterListPageSchema.safeParse(response.body).success, true);
  const query = app.queries.find((item) => item.model === "chapters");
  assert.equal(JSON.stringify(query.orderBy), JSON.stringify([{ chuongSo: "asc" }, { idChuong: "asc" }]));
  assert.equal(query.take, 50);
});

test("opening a distant chapter locates its actual page in either order", async () => {
  for (const [order, expectedPage, first] of [["asc", 3, 101], ["desc", 1, 125]]) {
    const response = await harness().request(`?chapterId=111&order=${order}`);
    assert.equal(response.body.meta.page, expectedPage);
    assert.equal(response.body.data[0].idChuong, first);
    assert.equal(response.body.data.some((row) => row.idChuong === 111), true);
  }
});

test("explicit pagination and search take precedence over the current chapter anchor", async () => {
  const page = await harness().request("?chapterId=111&page=2");
  assert.equal(page.body.meta.page, 2);
  assert.equal(page.body.data[0].idChuong, 51);
  const search = await harness().request(`?chapterId=111&search=${encodeURIComponent("Chương 12")}`);
  assert.equal(search.body.meta.total, 1);
  assert.equal(search.body.data[0].idChuong, 12);
});

test("deleted or foreign chapter anchors cannot expose their metadata", async () => {
  for (const chapterId of [1000, 1001, 9999]) {
    const response = await harness().request(`?chapterId=${chapterId}`);
    assert.equal(response.body.meta.page, 1);
    assert.equal(response.body.data.some((row) => row.idChuong === chapterId), false);
    assert.equal(response.body.meta.total, 125);
  }
});

test("a stale page clamps to the final available page instead of an empty screen", async () => {
  const app = harness();
  const response = await app.request("?page=99999");
  assert.equal(response.body.meta.page, 3);
  assert.equal(response.body.data.length, 25);
  assert.equal(app.queries.find((item) => item.model === "chapters").skip, 100);
});

test("numeric and Vietnamese decimal searches find one chapter without prefix matches", async () => {
  const app = harness();
  app.rows.push({ ...app.rows[0], idChuong: 501, chuongSo: 51.5, slug: "extra", tieuDeChuong: "Ngoại truyện" });
  for (const value of ["51.5", "51,5", "Chương 51,5", "chuong 51.5"]) {
    const response = await app.request(`?search=${encodeURIComponent(value)}`);
    assert.equal(response.body.meta.total, 1);
    assert.equal(response.body.data[0].idChuong, 501);
  }
  assert.equal((await app.request("?search=12")).body.meta.total, 1);
});

test("title search still works and empty results have a usable first page", async () => {
  const app = harness();
  app.rows[3].tieuDeChuong = "Cuộc gặp trong rừng";
  const found = await app.request(`?search=${encodeURIComponent("trong rừng")}`);
  assert.equal(found.body.data[0].idChuong, 4);
  const empty = await app.request("?search=not-present&page=88");
  assert.equal(empty.body.meta.page, 1);
  assert.equal(empty.body.meta.totalPage, 1);
  assert.equal(empty.body.data.length, 0);
});

test("malformed and excessive bounds fail before database queries", async () => {
  for (const query of ["?page=100001", "?page=Infinity", "?page=1.2", "?page=0", "?limit=101", "?limit=0", "?order=sideways", "?chapterId=-1", "?chapterId=2147483648", `?search=${"x".repeat(101)}`]) {
    const app = harness();
    assert.equal((await app.request(query)).status, 400, query);
    assert.equal(app.queries.length, 0, query);
  }
  assert.equal(schemas.getChapterNumberSearch("1e300"), null);
  assert.equal(schemas.getChapterNumberSearch("999999999999999999999999"), null);
});

test("missing stories return 404 and operational errors return a safe retryable error", async () => {
  assert.equal((await harness({ visible: false }).request()).status, 404);
  const failure = await harness({ fail: true }).request();
  assert.equal(failure.status, 500);
  assert.equal(JSON.stringify(failure.body).includes("credentials"), false);
  assert.match(failure.body.message, /thử lại/);
});

test("VIP status uses server identity and only purchases on the requested page", async () => {
  const guest = await harness().request("?includeAccess=1");
  assert.equal(guest.body.data[0].canRead, true);
  assert.equal(guest.body.data[1].canRead, false);
  const app = harness({ user: { idTaiKhoan: 17, roles: [] }, purchased: [2, 52] });
  const member = await app.request("?includeAccess=1");
  assert.equal(member.cache, "private, no-store");
  assert.equal(member.body.data[1].canRead, true);
  assert.equal(member.body.data[3].canRead, false);
  const query = app.queries.find((item) => item.model === "purchases");
  assert.equal(query.where.idTaiKhoan, 17);
  assert.ok(query.where.idChuong.in.every((id) => id <= 50));
  assert.equal(query.select.idChuong, true);
  const admin = await harness({ user: { idTaiKhoan: 1, roles: ["admin"] } }).request("?includeAccess=1");
  assert.ok(admin.body.data.every((chapter) => chapter.canRead));
});
