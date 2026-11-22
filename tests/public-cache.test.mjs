import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = new Map();
const plain = (value) => JSON.parse(JSON.stringify(value));

async function load(path, dependencies = {}, globals = {}) {
  if (!compiled.has(path)) {
    compiled.set(path, ts.transpileModule(await readFile(new URL(`../${path}`, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
  }
  const record = { exports: {} };
  vm.runInNewContext(compiled.get(path), {
    module: record, exports: record.exports, process: { env: {} }, console: { error() {} },
    require: (name) => name in dependencies ? dependencies[name] : require(name),
    ...globals,
  });
  return record.exports;
}

async function cacheHarness() {
  const entries = new Map();
  const policies = [];
  const invalidations = [];
  const api = {
    unstable_cache(callback, keyParts, options) {
      policies.push(options);
      return async (...args) => {
        const key = JSON.stringify([keyParts, args]);
        if (entries.has(key)) return JSON.parse(entries.get(key).body);
        const value = await callback(...args);
        // Next serializes successful cache results; failures must not be stored.
        entries.set(key, { body: JSON.stringify(value), tags: Array.from(options.tags) });
        return value;
      };
    },
    revalidateTag(tag, profile) {
      invalidations.push({ tag, profile: plain(profile) });
      for (const [key, entry] of entries) if (entry.tags.includes(tag)) entries.delete(key);
    },
  };
  const helpers = await load("lib/server/public-cache.ts", { "server-only": {}, "next/cache": api });
  return { entries, policies, invalidations, helpers, dependencies: {
    "next/cache": api, "react": { cache: (callback) => callback }, "@/lib/server/public-cache": helpers,
  } };
}

function card(id = 1) {
  return { idTruyen: id, tenTruyen: `Truyện ${id}`, slug: `truyen-${id}`, anhBia: "/cover.jpg", soChuong: 10,
    luotXem: 100, diemDanhGiaTrungBinh: { toString: () => "4.25" }, trang_thai: "dang_tien_hanh",
    truyenTheLoai: [{ theLoai: { idTheLoai: 7, tenTheLoai: "Tiên Hiệp" } }] };
}

test("home cache survives JSON round trips and reuses five bounded queries until invalidated", async () => {
  const app = await cacheHarness();
  const calls = [];
  const prisma = { truyen: { async findMany(query) {
    calls.push(query);
    return [{ ...card(), ...(query.select.updatedAt ? { updatedAt: new Date("2026-11-19T00:00:00Z"), chuong: [{ slug: "chuong-1", tieuDeChuong: "Chương 1" }] } : {}) }];
  } } };
  const query = await load("lib/queries/home.query.ts", { ...app.dependencies, "@/lib/prisma": { prisma } });
  const first = await query.getHomeData();
  const hit = await query.getHomeData();
  assert.deepEqual(plain(first), plain(hit));
  assert.equal(hit.updated[0].updatedAt, "2026-11-19T00:00:00.000Z");
  assert.equal(hit.latest[0].diemDanhGiaTrungBinh, "4.25");
  assert.equal(calls.length, 5);
  assert.equal(app.policies[0].revalidate, 60);
  for (const call of calls) {
    assert.ok(call.take <= 12);
    assert.equal(call.select.noiDungChuong, undefined);
  }
  app.helpers.revalidatePublicStories(["truyen-1"]);
  await query.getHomeData();
  assert.equal(calls.length, 10);
});

test("a home database failure preserves the fallback and retries instead of caching an empty catalog", async () => {
  const app = await cacheHarness();
  let unavailable = true;
  let calls = 0;
  const errors = [];
  const prisma = { truyen: { async findMany() { calls++; if (unavailable) throw new Error("Database unavailable"); return []; } } };
  const query = await load("lib/queries/home.query.ts", { ...app.dependencies, "@/lib/prisma": { prisma } }, { console: { error: (...args) => errors.push(args) } });
  assert.equal((await query.getHomeData()).featured, null);
  assert.equal(app.entries.size, 0);
  assert.equal(errors.length, 1);
  unavailable = false;
  await query.getHomeData();
  await query.getHomeData();
  assert.equal(calls, 10);
  assert.equal(app.entries.size, 1);
});

test("catalog cache keys include normalized filters and retain the safe pagination clamp", async () => {
  const app = await cacheHarness();
  const calls = [];
  const schema = await load("schemas/story-query.schema.ts");
  const mapper = await load("lib/mappers/story.mapper.ts");
  const prisma = { truyen: {
    async count(query) { calls.push({ kind: "count", ...query }); return 42; },
    async findMany(query) { calls.push({ kind: "list", ...query }); return [card()]; },
  } };
  const query = await load("lib/queries/story-list.query.ts", { ...app.dependencies, "@/lib/prisma": { prisma },
    "@/schemas/story-query.schema": schema, "@/lib/mappers/story.mapper": mapper, "./genre.query": { getGenreBySlug: async () => null } });
  const first = await query.getStoryList({ q: "  Truyện  ", author: "Tác giả", vip: "vip", page: 100000, limit: 20 });
  const hit = await query.getStoryList({ q: "Truyện", author: "Tác giả", vip: "vip", page: 100000, limit: 20 });
  assert.deepEqual(plain(first), plain(hit));
  assert.equal(calls.length, 2);
  assert.equal(calls[1].skip, 40);
  assert.equal(hit.pagination.page, 3);
  assert.equal(app.policies[0].revalidate, 120);
  await query.getStoryList({ q: "Truyện", author: "Tác giả khác", vip: "mien_phi", limit: 20 });
  assert.equal(calls.length, 4);
  assert.ok(calls[3].where.chuong.none);
});

test("genre identity and counts use public five-minute caches that genre mutations invalidate", async () => {
  const app = await cacheHarness();
  let calls = 0;
  const prisma = { theLoai: { async findMany({ select }) {
    calls++;
    return [{ idTheLoai: 7, tenTheLoai: "Tiên Hiệp", moTa: null, ...(select._count ? { _count: { truyenTheLoai: 42 } } : {}) }];
  } } };
  const query = await load("lib/queries/genre.query.ts", { ...app.dependencies, "@/lib/prisma": { prisma }, "@/lib/utils": { slugify: () => "tien-hiep" } });
  await query.getGenreBySlug("tien-hiep");
  await query.getGenreBySlug("7");
  await query.getAllGenresWithCount();
  assert.equal((await query.getAllGenresWithCount())[0].storyCount, 42);
  assert.equal(calls, 2);
  assert.ok(app.policies.every(({ revalidate }) => revalidate === 300));
  app.helpers.revalidatePublicStories(undefined, true);
  await query.getGenreBySlug("tien-hiep");
  await query.getAllGenresWithCount();
  assert.equal(calls, 4);
});

test("story detail caches a public DTO with stable dates and leaves missing stories uncached", async () => {
  const app = await cacheHarness();
  let reads = 0;
  const mapper = await load("lib/mappers/story-detail.mapper.ts");
  const raw = { ...card(), moTa: null, anhThumbnail: null, privateDiagnostic: "do-not-cache",
    _count: { theoDoiTruyen: 2, chuong: 1, danhGiaTruyen: 0 }, danhGiaTruyen: [],
    binh_luan: [{ idBinhLuan: 1, idTaiKhoan: 7, noiDung: "Cảm ơn", likeCount: 0, createdAt: new Date("2026-11-19T00:00:00Z"),
      taiKhoan: { tenTaiKhoan: "Author", email: "do-not-cache", hoSoCaNhan: null } }] };
  const prisma = {
    truyen: { async findFirst({ where }) { reads++; return where.slug === "missing" ? null : raw; } },
    chuong: { async findFirst() { return { slug: "chuong-1" }; }, async findMany() {
      return [{ idChuong: 1, chuongSo: { toString: () => "2.5" }, slug: "chuong-1", tieuDeChuong: "Chương 1", isFree: true, giaXu: 0, luotXem: 1, updatedAt: new Date("2026-11-19T00:00:00Z") }];
    } },
  };
  const query = await load("lib/queries/story-detail.query.ts", { ...app.dependencies, "@/lib/prisma": { prisma },
    "@/lib/mappers/story-detail.mapper": mapper, "@/lib/server/studio-ownership": { getStoryOwner: async () => ({ ownerId: 7 }) } });
  const first = await query.getStoryDetailPageBySlug("truyen-1");
  const hit = await query.getStoryDetailPageBySlug("truyen-1");
  assert.deepEqual(plain(first), plain(hit));
  assert.equal(hit.metadata.moTa, null);
  assert.equal(hit.story.chapters[0].chuongSo, 2.5);
  assert.equal(hit.story.chapters[0].updatedAt, "19/11/2026");
  assert.equal(hit.story.comments[0].isStoryAuthor, true);
  assert.equal([...app.entries.values()][0].body.includes("do-not-cache"), false);
  assert.equal(reads, 1);
  assert.equal(await query.getStoryDetailPageBySlug("missing"), null);
  assert.equal(await query.getStoryDetailPageBySlug("missing"), null);
  assert.equal(reads, 3);
  assert.equal(app.entries.size, 1);
  app.helpers.revalidatePublicStoryDetails(["truyen-1"]);
  assert.equal(app.entries.size, 0);
});

test("targeted story invalidation preserves other stories and uses Next 16 immediate expiration", async () => {
  const app = await cacheHarness();
  const firstTag = app.helpers.publicStoryTag("Truyen-1");
  const secondTag = app.helpers.publicStoryTag("truyen-2");
  app.entries.set("one", { body: "{}", tags: [firstTag] });
  app.entries.set("two", { body: "{}", tags: [secondTag] });
  app.helpers.revalidatePublicStoryDetails(["truyen-1", "truyen-1"]);
  assert.equal(app.entries.has("one"), false);
  assert.equal(app.entries.has("two"), true);
  assert.deepEqual(app.invalidations, [{ tag: firstTag, profile: { expire: 0 } }]);
  assert.ok(app.helpers.publicStoryTag("x".repeat(300)).length <= 256);
});

test("paid chapter access and wallet balance remain request-specific, with content and neighbors fetched together", async () => {
  const app = await cacheHarness();
  let accountId = null;
  let contentReads = 0;
  let neighborReads = 0;
  const prisma = {
    truyen: { async findFirst() { return { idTruyen: 1, tenTruyen: "Truyện 1", slug: "truyen-1", anhBia: null }; } },
    chuong: { async findFirst({ where }) {
      if (where.slug) return { idChuong: 1, idTruyen: 1, chuongSo: 1, tieuDeChuong: "Chương 1", slug: "chuong-1", isFree: false, giaXu: 10, createdAt: null };
      neighborReads++;
      return null;
    } },
    taiKhoan: { async findFirst() { return { idTaiKhoan: accountId, viTien: { soDuXu: accountId * 10 }, vaiTroNguoiDung: [] }; } },
    chuongDaMua: { async findUnique() { return accountId === 7 ? { idChuong: 1 } : null; } },
    noiDungChuong: { async findUnique() { contentReads++; await Promise.resolve(); assert.ok(neighborReads >= 4); return { noiDung: "Paid content" }; } },
  };
  const query = await load("lib/queries/chapter.query.ts", { ...app.dependencies, "@/lib/prisma": { prisma },
    "next/headers": { cookies: async () => ({ get: () => accountId ? { value: String(accountId) } : undefined }) },
    "@/lib/auth": { verifyToken: async (token) => ({ idTaiKhoan: Number(token) }) } });
  const guest = await query.getChapterDetail("truyen-1", "chuong-1");
  assert.equal(guest.access.canRead, false);
  assert.equal(guest.currentChapter.noiDungChuong, null);
  accountId = 7;
  const purchaser = await query.getChapterDetail("truyen-1", "chuong-1");
  assert.equal(purchaser.access.canRead, true);
  assert.equal(purchaser.access.balance, 70);
  accountId = 8;
  const other = await query.getChapterDetail("truyen-1", "chuong-1");
  assert.equal(other.access.canRead, false);
  assert.equal(other.access.balance, 80);
  assert.equal(other.currentChapter.noiDungChuong, null);
  assert.equal(contentReads, 1);
  assert.equal(app.entries.size, 0);
});

test("production Prisma reuses one client and adapter across module reloads and logs only errors", async () => {
  const shared = {};
  let adapters = 0;
  let clients = 0;
  const dependencies = {
    "dotenv/config": {},
    "@prisma/adapter-mariadb": { PrismaMariaDb: class { constructor() { adapters++; } } },
    "../app/generated/prisma/client": { PrismaClient: class { constructor(options) { clients++; this.options = options; } } },
  };
  const globals = { globalThis: shared, process: { env: { NODE_ENV: "production" } } };
  const first = await load("lib/prisma.ts", dependencies, globals);
  const second = await load("lib/prisma.ts", dependencies, globals);
  assert.equal(first.prisma, second.prisma);
  assert.equal(clients, 1);
  assert.equal(adapters, 1);
  assert.deepEqual(Array.from(first.prisma.options.log), ["error"]);
});
