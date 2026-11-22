import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = new Map();
for (const file of ["schemas/story-query.schema.ts", "lib/story-search.ts", "lib/queries/story-list.query.ts", "lib/queries/genre.query.ts"]) {
  compiled.set(file, ts.transpileModule(await readFile(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
}

function load(file, modules = {}) {
  const loadedModule = { exports: {} };
  vm.runInNewContext(compiled.get(file), {
    module: loadedModule, exports: loadedModule.exports, URLSearchParams, setTimeout, clearTimeout,
    require: (name) => name in modules ? modules[name] : require(name),
  });
  return loadedModule.exports;
}
const schema = load("schemas/story-query.schema.ts");
const search = load("lib/story-search.ts", { "@/schemas/story-query.schema": schema });
const plain = (value) => JSON.parse(JSON.stringify(value));

test("invalid fields fall back independently without erasing a valid keyword or filters", () => {
  const query = schema.parseStoryQueryParams({ q: "  Tiên Hiệp  ", theLoai: "tien-hiep", trangThai: "hoan_thanh", sapXep: "danhGia", page: "bad", limit: "500" });
  assert.equal(query.q, "Tiên Hiệp");
  assert.equal(query.theLoai, "tien-hiep");
  assert.equal(query.trangThai, "hoan_thanh");
  assert.equal(query.sapXep, "danhGia");
  assert.equal(query.page, 1);
  assert.equal(query.limit, 20);
  assert.equal(schema.parseStoryQueryParams({ sapXep: "invalid" }, { sapXep: "moiNhat" }).sapXep, "moiNhat");
});

test("search length, repeated fields and numeric boundaries are bounded at the server boundary", () => {
  for (const page of ["0", "-1", "1.5", "Infinity", "1e100", "100001", ["2", "3"]]) {
    const query = schema.parseStoryQueryParams({ q: "valid", page, soChuong: "100-500" });
    assert.equal(query.page, 1);
    assert.equal(query.q, "valid");
    assert.equal(query.soChuong, "100-500");
  }
  assert.equal(schema.parseStoryQueryParams({ q: "x".repeat(101), trangThai: "hoan_thanh" }).q, "");
  assert.equal(schema.parseStoryQueryParams({ q: ["a", "b"], theLoai: "tien-hiep" }).theLoai, "tien-hiep");
  assert.equal(schema.parseStoryQueryParams({ page: "100000", limit: "100" }).page, 100000);
});

test("pagination preserves keyword, genre and every filter, while changing a filter resets page", () => {
  const original = "q=abc&theLoai=tien-hiep&trangThai=hoan_thanh&sapXep=danhGia&soChuong=100-500&page=5&tab=ratings";
  const next = search.storySearchParams(original, { page: 2 }, { resetPage: false });
  assert.equal(next.get("q"), "abc");
  assert.equal(next.get("theLoai"), "tien-hiep");
  assert.equal(next.get("trangThai"), "hoan_thanh");
  assert.equal(next.get("sapXep"), "danhGia");
  assert.equal(next.get("soChuong"), "100-500");
  assert.equal(next.get("page"), "2");
  assert.equal(next.get("tab"), "ratings");
  const filtered = search.storySearchParams(next.toString(), { soChuong: "tren-500" });
  assert.equal(filtered.has("page"), false);
  assert.equal(filtered.get("q"), "abc");
});

test("clearing filters preserves route state and respects fixed completed/genre constraints", () => {
  const params = search.storySearchParams("q=a&trangThai=dang_tien_hanh&sapXep=danhGia&page=5&tab=new", {}, {
    clear: true, defaults: { trangThai: "hoan_thanh" }, fixed: { trangThai: "hoan_thanh" },
  });
  assert.equal(params.toString(), "tab=new");
  const fixed = search.storySearchParams("theLoai=wrong&trangThai=dang_tien_hanh", { trangThai: "tam_dung" }, {
    defaults: { trangThai: "hoan_thanh" }, fixed: { trangThai: "hoan_thanh", theLoai: "tien-hiep" },
  });
  assert.equal(fixed.has("trangThai"), false);
  assert.equal(fixed.has("theLoai"), false);
  assert.equal(search.storySearchParams("sapXep=luotXem", {}, { defaults: { sapXep: "moiNhat" } }).get("sapXep"), "luotXem");
});

test("duplicate URL fields are normalized exactly like server search parameters", () => {
  const params = search.storySearchParams("q=a&q=b&sapXep=danhGia&page=2&page=3", {}, { resetPage: false });
  assert.equal(params.has("q"), false);
  assert.equal(params.has("page"), false);
  assert.equal(params.get("sapXep"), "danhGia");
});

function controllerHarness(initialSearch = "", config) {
  let nextId = 0;
  const timers = new Map();
  const scheduled = [];
  const navigations = [];
  const controller = search.createStorySearchController({
    pathname: "/tim-kiem", initialSearch, config,
    navigate: (href, method) => navigations.push({ href, method }),
    schedule: (callback) => { const id = ++nextId; timers.set(id, callback); scheduled.push(callback); return id; },
    cancel: (id) => timers.delete(id),
  });
  return {
    controller, navigations, scheduled,
    get state() { return controller.getSnapshot(); },
    tick() { const pending = [...timers.values()]; timers.clear(); pending.forEach((callback) => callback()); },
  };
}

test("debounced typing coalesces and applies a freshly chosen genre without restoring stale URL fields", () => {
  const app = controllerHarness("page=4&sapXep=danhGia");
  app.controller.setKeyword("linh");
  app.controller.setKeyword("linh vuc");
  app.controller.update({ theLoai: "tien-hiep" });
  assert.equal(app.navigations.length, 1);
  const params = new URL(app.navigations[0].href, "https://example.test").searchParams;
  assert.equal(params.get("q"), "linh vuc");
  assert.equal(params.get("theLoai"), "tien-hiep");
  assert.equal(params.get("sapXep"), "danhGia");
  assert.equal(params.has("page"), false);
  // Even an already queued callback cannot run after cancellation.
  app.scheduled.forEach((callback) => callback());
  app.tick();
  assert.equal(app.navigations.length, 1);
});

test("an older response does not erase a newer keyword draft", () => {
  const app = controllerHarness();
  app.controller.setKeyword("first");
  app.tick();
  app.controller.setKeyword("second");
  app.controller.acceptRoute("q=first", true);
  app.controller.acceptRoute("q=first", false);
  assert.equal(app.state.keyword, "second");
  assert.equal(new URLSearchParams(app.state.search).get("q"), "second");
  app.tick();
  assert.equal(app.navigations.at(-1).href, "/tim-kiem?q=second");
  app.controller.acceptRoute("q=second", false);
  assert.equal(app.state.pending, false);
});

test("rapid filter changes compose before the previous route commits", () => {
  const app = controllerHarness("q=abc");
  app.controller.update({ sapXep: "danhGia" });
  const first = app.state.search;
  app.controller.update({ trangThai: "hoan_thanh" });
  const latest = app.state.search;
  app.controller.acceptRoute(first, true);
  assert.equal(app.state.search, latest);
  app.controller.acceptRoute(latest, false);
  assert.equal(app.controller.getQuery().sapXep, "danhGia");
  assert.equal(app.controller.getQuery().trangThai, "hoan_thanh");
  assert.equal(app.state.pending, false);
});

test("Back/Forward and unmount cancel delayed requests instead of rewriting the restored URL", () => {
  const app = controllerHarness("q=before");
  app.controller.setKeyword("unsent");
  app.controller.reset("q=back&theLoai=kiem-hiep");
  app.tick();
  app.scheduled.forEach((callback) => callback());
  assert.equal(app.navigations.length, 0);
  assert.equal(app.state.keyword, "back");
  assert.equal(app.controller.getQuery().theLoai, "kiem-hiep");
  app.controller.setKeyword("unmounted");
  app.controller.stopDebounce();
  app.tick();
  assert.equal(app.navigations.length, 0);
});

test("fixed route queries cannot be changed through controls or clear-all", () => {
  const app = controllerHarness("trangThai=dang_tien_hanh&q=story", { defaults: { trangThai: "hoan_thanh" }, fixed: { trangThai: "hoan_thanh" } });
  app.controller.update({ trangThai: "tam_dung" });
  assert.equal(app.controller.getQuery().trangThai, "hoan_thanh");
  assert.equal(new URLSearchParams(app.state.search).has("trangThai"), false);
  app.controller.clear();
  assert.equal(app.controller.getQuery().trangThai, "hoan_thanh");
  assert.equal(app.state.keyword, "");
});

function queryHarness({ total = 50, genre = { idTheLoai: 7 } } = {}) {
  const queries = [];
  const countQueries = [];
  const prisma = { truyen: {
    async findMany(query) { queries.push(plain(query)); return query.skip >= total ? [] : [{ idTruyen: query.skip + 1 }]; },
    async count(query) { countQueries.push(plain(query)); return total; },
  } };
  const queriesModule = load("lib/queries/story-list.query.ts", {
    "@/lib/prisma": { prisma },
    "@/schemas/story-query.schema": schema,
    "@/lib/mappers/story.mapper": { mapStory: (story) => story },
    "./genre.query": { getGenreBySlug: async () => genre },
  });
  return { ...queriesModule, queries, countQueries };
}

test("story queries select card metadata, never chapter content, and use stable ordering", async () => {
  const app = queryHarness();
  await app.getStoryList({ q: "name", theLoai: "tien-hiep", sapXep: "danhGia" });
  assert.deepEqual(app.queries[0].orderBy, [{ diemDanhGiaTrungBinh: "desc" }, { idTruyen: "desc" }]);
  assert.equal(app.queries[0].select.moTa, undefined);
  assert.equal(app.queries[0].select.chuong, undefined);
  assert.equal(app.queries[0].select.truyenTheLoai.select.theLoai.select.tenTheLoai, true);
  assert.deepEqual(app.queries[0].where.truyenTheLoai, { some: { idTheLoai: 7 } });
  assert.equal(app.queries[0].where.OR[3].truyen_tac_gia_dich.some.tac_gia_dich.ten.contains, "name");
});

test("chapter count ranges have correct strict boundaries and no overlapping endpoints", async () => {
  for (const [soChuong, expected] of [["duoi-100", { lt: 100 }], ["100-500", { gte: 100, lte: 500 }], ["tren-500", { gt: 500 }]]) {
    const app = queryHarness();
    await app.getStoryList({ soChuong });
    assert.deepEqual(app.queries[0].where.soChuong, expected);
    for (const value of [99, 99.5, 100, 500, 500.5, 501]) {
      const matches = (expected.lt === undefined || value < expected.lt) && (expected.gte === undefined || value >= expected.gte) && (expected.lte === undefined || value <= expected.lte) && (expected.gt === undefined || value > expected.gt);
      assert.equal(matches, soChuong === "duoi-100" ? value < 100 : soChuong === "100-500" ? value >= 100 && value <= 500 : value > 500);
    }
  }
});

test("an out-of-range page is clamped before querying so a hostile offset is never sent to Prisma", async () => {
  const app = queryHarness({ total: 41 });
  const result = await app.getStoryList({ page: 999, limit: 20 });
  assert.equal(result.pagination.page, 3);
  assert.equal(result.pagination.totalPages, 3);
  assert.equal(app.queries.length, 1);
  assert.equal(app.queries[0].skip, 40);
  assert.equal(result.items.length, 1);
});

test("unknown genres are empty results instead of silently removing the genre constraint", async () => {
  const app = queryHarness({ genre: null, total: 0 });
  const result = await app.getStoryList({ theLoai: "no-longer-exists" });
  assert.deepEqual(app.queries[0].where.truyenTheLoai, { some: { idTheLoai: -1 } });
  assert.equal(result.pagination.total, 0);
});

test("genre slug resolution uses a request-cached light catalog without story counts", async () => {
  const calls = [];
  const cache = (callback) => {
    const memo = new Map();
    return (...args) => {
      const key = JSON.stringify(args);
      if (!memo.has(key)) memo.set(key, callback(...args));
      return memo.get(key);
    };
  };
  const genreModule = load("lib/queries/genre.query.ts", {
    react: { cache }, "@/lib/utils": { slugify: (value) => value === "Tiên Hiệp" ? "tien-hiep" : value.toLowerCase() },
    "@/lib/prisma": { prisma: { theLoai: { async findMany(query) {
      calls.push(plain(query));
      return [{ idTheLoai: 7, tenTheLoai: "Tiên Hiệp", moTa: null }];
    } } } },
  });
  const first = await genreModule.getGenreBySlug("tien-hiep");
  const second = await genreModule.getGenreBySlug("7");
  assert.equal(first.idTheLoai, 7);
  assert.equal(second.idTheLoai, 7);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].select, { idTheLoai: true, tenTheLoai: true, moTa: true });
  assert.equal(calls[0].include, undefined);
});
