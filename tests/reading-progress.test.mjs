import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require("next/server");

async function compile(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
const progressSource = await compile("../app/api/chapters/[id]/progress/route.ts");
const historySource = await compile("../app/api/reading-history/route.ts");
const schemaSource = await compile("../lib/reading-progress.ts");

function load(source, replacements = {}) {
  const routeModule = { exports: {} };
  vm.runInNewContext(source, {
    module: routeModule,
    exports: routeModule.exports,
    console: { error() {} },
    require(name) { return replacements[name] ?? require(name); },
  });
  return routeModule.exports;
}
const schemas = load(schemaSource);

function harness({ authorized = true, free = true, purchased = false, roles = ["user"], visible = true, collision = false } = {}) {
  const rows = new Map();
  let writes = 0;
  let contentReads = 0;
  let collided = false;
  const lastRead = {};
  const rowKey = (where) => {
    const { idTaiKhoan, idChuong } = where.idTaiKhoan_idChuong;
    return `${idTaiKhoan}:${idChuong}`;
  };
  function updateRow({ where, data }) {
    const key = rowKey(where);
    rows.set(key, { ...data });
    writes += 1;
    return rows.get(key);
  }
  const prisma = {
    chuong: {
      async findFirst(query) {
        lastRead.chapter = query;
        return visible ? { idChuong: query.where.idChuong, isFree: free } : null;
      },
    },
    chuongDaMua: {
      async findUnique(query) {
        lastRead.purchase = query;
        return purchased ? { idChuong: query.where.idTaiKhoan_idChuong.idChuong } : null;
      },
    },
    noiDungChuong: { async findUnique() { contentReads += 1; throw new Error("Progress must never read chapter content"); } },
    tienDoDoc: {
      async findUnique(query) { lastRead.progress = query; return rows.get(rowKey(query.where)) ?? null; },
      async upsert(query) {
        if (collision && !collided) {
          collided = true;
          rows.set(rowKey(query.where), { viTriDoc: 0, phanTramDoc: 0, ngayDocCuoi: new Date(0) });
          throw Object.assign(new Error("Concurrent insert"), { code: "P2002" });
        }
        return updateRow({ where: query.where, data: query.update });
      },
      async update(query) { return updateRow(query); },
      async findMany(query) {
        lastRead.history = query;
        return query.where.idTaiKhoan === 7 && visible ? [historyRow] : [];
      },
      async count() { return visible ? 1 : 0; },
    },
  };
  const historyRow = {
    viTriDoc: 300,
    phanTramDoc: "32.50",
    ngayDocCuoi: new Date("2026-11-19T00:00:00Z"),
    chuong: { idChuong: 11, chuongSo: "11.0", tieuDeChuong: "Chương mười một", slug: "chuong-11", truyen: { tenTruyen: "Tác phẩm", slug: "tac-pham", anhBia: "/cover.webp" } },
  };
  const replacements = {
    "@/lib/prisma": { prisma },
    "@/lib/reading-progress": schemas,
    "@/lib/server/auth-session": {
      async requireUser() {
        return authorized
          ? { authorized: true, user: { idTaiKhoan: 7, roles } }
          : { authorized: false, response: NextResponse.json({ success: false }, { status: 401 }) };
      },
    },
  };
  const progress = load(progressSource, replacements);
  const history = load(historySource, replacements);

  return {
    rows,
    lastRead,
    get writes() { return writes; },
    get contentReads() { return contentReads; },
    async request({ method = "GET", id = "11", body = { position: 300, percent: 32.5 }, rawBody, headers = {} } = {}) {
      const request = new NextRequest(`https://webnovel.example/api/chapters/${id}/progress`, {
        method,
        headers: { "content-type": "application/json", origin: "https://webnovel.example", ...headers },
        ...(method === "PUT" ? { body: rawBody ?? JSON.stringify(body) } : {}),
      });
      const response = await progress[method](request, { params: Promise.resolve({ id }) });
      return { status: response.status, data: await response.json(), cache: response.headers.get("cache-control") };
    },
    async history(query = "") {
      const response = await history.GET(new NextRequest(`https://webnovel.example/api/reading-history${query}`));
      return { status: response.status, data: await response.json(), cache: response.headers.get("cache-control") };
    },
  };
}

test("progress and history require authentication", async () => {
  const app = harness({ authorized: false });
  assert.equal((await app.request()).status, 401);
  assert.equal((await app.request({ method: "PUT" })).status, 401);
  assert.equal((await app.history()).status, 401);
  assert.equal(app.writes, 0);
});

test("a new reader receives empty progress without creating database records", async () => {
  const app = harness();
  const response = await app.request();
  assert.equal(response.status, 200);
  assert.deepEqual(response.data.data, { position: 0, percent: 0, updatedAt: null });
  assert.equal(response.cache, "private, no-store");
  assert.equal(app.writes, 0);
});

test("free chapter progress is saved to the authenticated account and restored", async () => {
  const app = harness();
  app.rows.set("99:11", { viTriDoc: 800, phanTramDoc: 90, ngayDocCuoi: new Date() });
  const saved = await app.request({ method: "PUT", body: { position: 1542, percent: 37.236 } });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.data.position, 1542);
  assert.equal(saved.data.data.percent, 37.24);
  assert.ok(saved.data.data.updatedAt);
  const restored = await app.request();
  assert.deepEqual(restored.data.data, saved.data.data);
  assert.equal(app.rows.get("99:11").viTriDoc, 800);
  assert.equal(app.contentReads, 0);
});

test("repeated saves update a unique account/chapter record instead of duplicating history", async () => {
  const app = harness();
  await app.request({ method: "PUT", body: { position: 100, percent: 10 } });
  await app.request({ method: "PUT", body: { position: 500, percent: 50 } });
  assert.equal(app.rows.size, 1);
  assert.equal((await app.request()).data.data.position, 500);
});

test("a concurrent first-save collision retries the existing progress row", async () => {
  const app = harness({ collision: true });
  assert.equal((await app.request({ method: "PUT" })).status, 200);
  assert.equal(app.rows.size, 1);
  assert.equal((await app.request()).data.data.percent, 32.5);
});

test("VIP chapters reject both progress reads and writes until purchased", async () => {
  const app = harness({ free: false });
  assert.equal((await app.request()).status, 403);
  assert.equal((await app.request({ method: "PUT" })).status, 403);
  assert.equal(app.writes, 0);
});

test("purchased chapters and admins can save VIP reading progress", async () => {
  for (const options of [{ free: false, purchased: true }, { free: false, roles: ["admin"] }]) {
    const app = harness(options);
    assert.equal((await app.request({ method: "PUT" })).status, 200);
    assert.equal((await app.request()).data.data.percent, 32.5);
  }
});

test("hidden or deleted chapter/story returns 404 without progress writes", async () => {
  const app = harness({ visible: false });
  assert.equal((await app.request()).status, 404);
  assert.equal((await app.request({ method: "PUT" })).status, 404);
  assert.equal(app.writes, 0);
});

test("untrusted identity fields and malformed progress values are rejected", async () => {
  const app = harness();
  for (const body of [
    { position: 100, percent: 50, idTaiKhoan: 99 },
    { position: 100, percent: 50, idChuong: 12 },
    { position: -1, percent: 50 },
    { position: 4_294_967_296, percent: 50 },
    { position: 1.5, percent: 50 },
    { position: 100, percent: -1 },
    { position: 100, percent: 101 },
    { position: "100", percent: 50 },
    {},
  ]) assert.equal((await app.request({ method: "PUT", body })).status, 400);
  assert.equal((await app.request({ method: "PUT", rawBody: "{" })).status, 400);
  assert.equal(app.writes, 0);
});

test("invalid chapter identifiers never access private progress", async () => {
  const app = harness();
  for (const id of ["0", "-1", "1.2", "not-a-number", "2147483648"]) {
    assert.equal((await app.request({ id })).status, 400);
    assert.equal((await app.request({ id, method: "PUT" })).status, 400);
  }
});

test("cross-site progress saves are rejected", async () => {
  const app = harness();
  assert.equal((await app.request({ method: "PUT", headers: { origin: "https://attacker.example" } })).status, 403);
  assert.equal((await app.request({ method: "PUT", headers: { "sec-fetch-site": "cross-site" } })).status, 403);
  assert.equal(app.writes, 0);
});

test("an account switch cannot save or read progress using the previous account scope", async () => {
  const app = harness();
  const headers = { "x-reader-account": "99" };
  assert.equal((await app.request({ headers })).status, 409);
  assert.equal((await app.request({ method: "PUT", headers })).status, 409);
  assert.equal(app.writes, 0);
  assert.equal((await app.request({ method: "PUT", headers: { "x-reader-account": "7" } })).status, 200);
});

test("history returns only own bounded metadata with numeric progress", async () => {
  const app = harness();
  const result = await app.history("?page=2&limit=10");
  assert.equal(result.status, 200);
  assert.equal(result.cache, "private, no-store");
  assert.equal(result.data.data[0].percent, 32.5);
  assert.equal(result.data.data[0].chapterNumber, 11);
  assert.equal(result.data.data[0].storySlug, "tac-pham");
  assert.equal(result.data.data[0].storyCover, "/cover.webp");
  assert.equal("noiDung" in result.data.data[0], false);
  assert.equal(app.lastRead.history.where.idTaiKhoan, 7);
  assert.equal(app.lastRead.history.take, 10);
  assert.equal(app.lastRead.history.skip, 10);
  assert.equal(app.lastRead.history.where.chuong.truyen.slug, undefined);
});

test("history can target one story for continue-reading reconciliation", async () => {
  const app = harness();
  const result = await app.history("?storySlug=tac-pham&limit=1");
  assert.equal(result.status, 200);
  assert.equal(app.lastRead.history.take, 1);
  assert.equal(app.lastRead.history.where.chuong.truyen.slug, "tac-pham");
});

test("invalid history pages and excessive page sizes fail without an unbounded query", async () => {
  const app = harness();
  for (const query of ["?page=0", "?page=NaN", "?page=1.5", "?limit=999", "?limit=-1"]) {
    assert.equal((await app.history(query)).status, 400);
  }
  assert.equal(app.lastRead.history, undefined);
});
