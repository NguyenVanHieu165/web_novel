import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require("next/server");
const source = await readFile(new URL("../app/api/truyen/[slug]/rating/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness({ authorized = true, available = true, failCounter = false } = {}) {
  let rows = [
    { idTaiKhoan: 99, idTruyen: 5, soSao: 4, noiDung: "Another reader's review", isDeleted: false },
    { idTaiKhoan: 88, idTruyen: 5, soSao: 1, noiDung: "Deleted review", isDeleted: true },
  ];
  let counter = { average: 4, total: 1 };
  let writes = 0;
  let authCalls = 0;
  let pendingTransaction = Promise.resolve();
  const queryOwnRating = ({ where }) => {
    const { idTaiKhoan, idTruyen } = where.idTaiKhoan_idTruyen;
    return rows.find((row) => row.idTaiKhoan === idTaiKhoan && row.idTruyen === idTruyen) ?? null;
  };
  const ratings = {
    async aggregate({ where }) {
      assert.deepEqual(JSON.parse(JSON.stringify(where.OR)), [{ isDeleted: false }, { isDeleted: null }]);
      const matching = rows.filter((row) => row.idTruyen === where.idTruyen && !row.isDeleted);
      return { _avg: { soSao: matching.length ? matching.reduce((sum, row) => sum + row.soSao, 0) / matching.length : null }, _count: { _all: matching.length } };
    },
    async findUnique(query) { return queryOwnRating(query); },
    async upsert({ where, create, update }) {
      writes += 1;
      const found = queryOwnRating({ where });
      if (found) Object.assign(found, update);
      else rows.push({ ...create });
      return found ?? create;
    },
  };
  const tx = {
    async $queryRaw(_strings, slug) { return available && slug === "sample-story" ? [{ idTruyen: 5 }] : []; },
    async $executeRaw(_strings, average, total, storyId) {
      assert.equal(storyId, 5);
      if (failCounter) throw new Error("Internal SQL write failure");
      counter = { average, total };
      return 1;
    },
    danhGiaTruyen: ratings,
  };
  const prisma = {
    truyen: { async findFirst({ where }) { return available && where.slug === "sample-story" && !where.isDeleted ? { idTruyen: 5 } : null; } },
    danhGiaTruyen: ratings,
    async $transaction(callback) {
      const previous = pendingTransaction;
      let release;
      pendingTransaction = new Promise((resolve) => { release = resolve; });
      await previous;
      const snapshot = structuredClone({ rows, counter });
      try { return await callback(tx); }
      catch (error) { rows = snapshot.rows; counter = snapshot.counter; throw error; }
      finally { release(); }
    },
  };
  const routeModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: routeModule, exports: routeModule.exports, console: { error() {} },
    require(name) {
      if (name === "@/lib/prisma") return { prisma };
      if (name === "@/lib/server/auth-session") return {
        async requireUser() {
          authCalls += 1;
          return authorized
            ? { authorized: true, user: { idTaiKhoan: 7, roles: ["user"] } }
            : { authorized: false, response: NextResponse.json({ success: false }, { status: 401 }) };
        },
      };
      return require(name);
    },
  });
  return {
    get rows() { return rows; },
    get writes() { return writes; },
    get authCalls() { return authCalls; },
    get counter() { return counter; },
    async request({ method = "GET", body = { stars: 5, content: " My review " }, rawBody, slug = "sample-story", headers = {} } = {}) {
      const request = new NextRequest(`https://webnovel.example/api/truyen/${slug}/rating`, {
        method,
        headers: { "content-type": "application/json", origin: "https://webnovel.example", cookie: "token=test", ...headers },
        ...(method === "PUT" ? { body: rawBody ?? JSON.stringify(body) } : {}),
      });
      const response = await routeModule.exports[method](request, { params: Promise.resolve({ slug }) });
      return { status: response.status, body: await response.json(), cacheControl: response.headers.get("cache-control") };
    },
  };
}

test("rating summary is public, excludes deleted reviews and never exposes another user's review", async () => {
  const app = harness({ authorized: false });
  const result = await app.request();
  assert.equal(result.status, 200);
  assert.equal(result.body.average, 4);
  assert.equal(result.body.total, 1);
  assert.equal(result.body.rating, null);
  assert.equal(result.cacheControl, "private, no-store");
  assert.equal(JSON.stringify(result.body).includes("Another reader"), false);
});

test("a rating requires authentication and an available story", async () => {
  const guest = harness({ authorized: false });
  assert.equal((await guest.request({ method: "PUT" })).status, 401);
  assert.equal(guest.writes, 0);
  const unavailable = harness({ available: false });
  assert.equal((await unavailable.request()).status, 404);
  assert.equal((await unavailable.request({ method: "PUT" })).status, 404);
  assert.equal(unavailable.writes, 0);
});

test("cross-site ratings are rejected before authentication", async () => {
  for (const headers of [{ origin: "https://attacker.example" }, { "sec-fetch-site": "cross-site" }]) {
    const app = harness();
    assert.equal((await app.request({ method: "PUT", headers })).status, 403);
    assert.equal(app.authCalls, 0);
    assert.equal(app.writes, 0);
  }
});

test("invalid stars, oversized text and client identity fields cannot be written", async () => {
  for (const body of [
    { stars: 0 }, { stars: 6 }, { stars: 1.5 }, { stars: "5" }, {},
    { stars: 5, content: "a".repeat(2001) }, { stars: 5, idTaiKhoan: 99 }, { stars: 5, idTruyen: 99 },
  ]) {
    const app = harness();
    assert.equal((await app.request({ method: "PUT", body })).status, 400);
    assert.equal(app.writes, 0);
  }
  assert.equal((await harness().request({ method: "PUT", rawBody: "{" })).status, 400);
});

test("a valid rating is stored under the authenticated identity and updates aggregate", async () => {
  const app = harness();
  const result = await app.request({ method: "PUT" });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { success: true, average: 4.5, total: 2, rating: { stars: 5, content: "My review" } });
  assert.equal(app.rows.find((row) => row.idTaiKhoan === 7).idTruyen, 5);
  assert.deepEqual(app.counter, { average: 4.5, total: 2 });
  const restored = await app.request();
  assert.deepEqual(restored.body.rating, { stars: 5, content: "My review" });
});

test("subsequent ratings update one record instead of inflating vote count", async () => {
  const app = harness();
  await app.request({ method: "PUT" });
  const updated = await app.request({ method: "PUT", body: { stars: 2 } });
  assert.equal(updated.status, 200);
  assert.equal(app.rows.filter((row) => row.idTaiKhoan === 7).length, 1);
  assert.deepEqual(updated.body.rating, { stars: 2, content: "" });
  assert.deepEqual(app.counter, { average: 3, total: 2 });
});

test("a soft-deleted rating is restored as the same account's one review", async () => {
  const app = harness();
  app.rows.push({ idTaiKhoan: 7, idTruyen: 5, soSao: 1, noiDung: "Old", isDeleted: true });
  assert.equal((await app.request()).body.rating, null);
  const updated = await app.request({ method: "PUT" });
  assert.equal(updated.status, 200);
  assert.equal(app.rows.filter((row) => row.idTaiKhoan === 7).length, 1);
  assert.equal(app.rows.find((row) => row.idTaiKhoan === 7).isDeleted, false);
  assert.equal(updated.body.total, 2);
});

test("failure updating the aggregate rolls back the rating and hides internal errors", async () => {
  const app = harness({ failCounter: true });
  const result = await app.request({ method: "PUT" });
  assert.equal(result.status, 500);
  assert.equal(app.rows.some((row) => row.idTaiKhoan === 7), false);
  assert.deepEqual(app.counter, { average: 4, total: 1 });
  assert.equal(JSON.stringify(result.body).includes("SQL"), false);
});

test("concurrent ratings remain one vote for the account with serialized transactions", async () => {
  const app = harness();
  const results = await Promise.all([
    app.request({ method: "PUT", body: { stars: 5 } }),
    app.request({ method: "PUT", body: { stars: 2 } }),
  ]);
  assert.deepEqual(results.map(({ status }) => status), [200, 200]);
  assert.equal(app.rows.filter((row) => row.idTaiKhoan === 7).length, 1);
  assert.deepEqual(app.counter, { average: 3, total: 2 });
});
