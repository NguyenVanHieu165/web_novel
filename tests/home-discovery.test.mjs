import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

async function loadModule(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: loadedModule,
    exports: loadedModule.exports,
    require(name) {
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return loadedModule.exports;
}

const { getHomeTabStories, mergeUniqueStories, getHomeGenres } = await loadModule("../lib/home-discovery.ts");

function story(id, overrides = {}) {
  return {
    idTruyen: id,
    tenTruyen: `Truyện ${id}`,
    slug: `truyen-${id}`,
    anhBia: "",
    soChuong: 10,
    luotXem: id,
    diemDanhGiaTrungBinh: 3,
    soLuotDanhGia: 1,
    trang_thai: "dang_tien_hanh",
    isDeleted: false,
    createdAt: id,
    updatedAt: id,
    truyenTheLoai: [],
    ...overrides,
  };
}

async function queryHarness(stories, { fail = false } = {}) {
  const calls = [];
  const prisma = {
    truyen: {
      async findMany(query) {
        calls.push(query);
        if (fail) throw new Error("Database unavailable");
        return stories.filter((item) =>
          item.isDeleted === query.where.isDeleted &&
          (!query.where.trang_thai || item.trang_thai === query.where.trang_thai) &&
          (!query.where.soLuotDanhGia || item.soLuotDanhGia > query.where.soLuotDanhGia.gt),
        ).sort((a, b) => {
          for (const order of query.orderBy) {
            const [field, direction] = Object.entries(order)[0];
            const difference = Number(a[field]) - Number(b[field]);
            if (difference) return direction === "desc" ? -difference : difference;
          }
          return 0;
        }).slice(0, query.take);
      },
    },
  };
  const queryModule = await loadModule("../lib/queries/home.query.ts", { "@/lib/prisma": { prisma } });
  return { ...queryModule, calls };
}

test("home discovery ranks each tab across the catalog, including older stories", async () => {
  const catalog = Array.from({ length: 30 }, (_, index) => story(index + 1));
  catalog[0] = story(1, { luotXem: 50_000 });
  catalog[1] = story(2, { diemDanhGiaTrungBinh: 5 });
  catalog[2] = story(3, { trang_thai: "hoan_thanh", luotXem: 500 });
  catalog[3] = story(4, { diemDanhGiaTrungBinh: 5, soLuotDanhGia: 0 });
  catalog.push(story(99, { isDeleted: true, luotXem: 1_000_000 }));
  const app = await queryHarness(catalog);
  const data = await app.getHomeData();
  assert.ok(!data.latest.some(({ idTruyen }) => idTruyen < 10));
  assert.equal(getHomeTabStories(data, "trending")[0].idTruyen, 1);
  assert.equal(getHomeTabStories(data, "top-rated")[0].idTruyen, 2);
  assert.equal(getHomeTabStories(data, "newest")[0].idTruyen, 30);
  assert.deepEqual(Array.from(getHomeTabStories(data, "completed"), ({ idTruyen }) => idTruyen), [3]);
  assert.ok(!data.rated.some(({ idTruyen }) => idTruyen === 4));
  assert.equal(data.featured.idTruyen, 1);
});

test("home queries stay bounded and select only card fields plus one chapter summary", async () => {
  const app = await queryHarness([story(1)]);
  await app.getHomeData();
  assert.equal(app.calls.length, 5);
  for (const query of app.calls) {
    assert.ok(query.take > 0 && query.take <= 12);
    assert.equal(query.include, undefined);
    assert.equal(query.select.moTa, undefined);
    assert.equal(query.select.noiDungChuong, undefined);
    assert.ok(query.orderBy.some((entry) => "idTruyen" in entry));
  }
  const withChapter = app.calls.filter(({ select }) => select.chuong);
  assert.equal(withChapter.length, 1);
  assert.equal(withChapter[0].select.chuong.take, 1);
  assert.deepEqual(Object.keys(withChapter[0].select.chuong.select), ["tieuDeChuong", "slug"]);
});

test("completed stays empty when only ongoing stories exist and ignores a misleading badge", () => {
  const ongoing = story(1, { badge: "full" });
  const collections = { latest: [ongoing], popular: [ongoing], rated: [], completed: [] };
  assert.equal(getHomeTabStories(collections, "completed").length, 0);
  assert.equal(getHomeTabStories({ ...collections, completed: [ongoing] }, "completed").length, 0);
});

test("combined suggestions and merged genre preview contain unique story IDs without mutating inputs", () => {
  const latest = Array.from({ length: 12 }, (_, index) => story(index + 1));
  const older = story(50);
  const popular = [latest[0], older];
  const collections = { latest, popular, rated: [older, latest[1]], completed: [] };
  const suggestions = getHomeTabStories(collections, "all");
  assert.equal(suggestions.length, 10);
  assert.equal(new Set(suggestions.map(({ idTruyen }) => idTruyen)).size, 10);
  assert.ok(suggestions.some(({ idTruyen }) => idTruyen === 50));
  const merged = mergeUniqueStories(latest, popular);
  assert.equal(merged.length, 13);
  assert.equal(merged[0], latest[0]);
  assert.equal(latest.length, 12);
  assert.equal(popular.length, 2);
});

test("genre navigation uses real catalog IDs and deduplicates repeated genre relations", () => {
  const first = { idTheLoai: 7, tenTheLoai: "Tiên Hiệp" };
  const second = { idTheLoai: 21, tenTheLoai: "Đô Thị" };
  const genres = getHomeGenres([
    story(1, { truyenTheLoai: [{ theLoai: first }] }),
    story(2, { truyenTheLoai: [{ theLoai: first }, { theLoai: second }] }),
  ]);
  assert.equal(genres.length, 2);
  assert.deepEqual(Array.from(genres, ({ idTheLoai }) => idTheLoai).sort((a, b) => a - b), [7, 21]);
});

test("empty catalog remains distinguishable from database failure", async () => {
  const empty = await queryHarness([]);
  const result = await empty.getHomeData();
  assert.equal(result.featured, null);
  for (const key of ["latest", "updated", "popular", "rated", "completed"]) assert.equal(result[key].length, 0);
  const failed = await queryHarness([], { fail: true });
  await assert.rejects(failed.getHomeData(), /Database unavailable/);
});
