import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require("next/server");
const compiledRoute = ts.transpileModule(await readFile(
  new URL("../app/api/notifications/route.ts", import.meta.url), "utf8",
), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness({ authorized = true, failDatabase = false } = {}) {
  const reads = [];
  let mutations = 0;
  const notifications = [
    { idThongBao: 1, idTaiKhoan: 7, daDoc: false },
    { idThongBao: 2, idTaiKhoan: 7, daDoc: null },
    { idThongBao: 3, idTaiKhoan: 7, daDoc: true },
    { idThongBao: 4, idTaiKhoan: 99, daDoc: false },
  ];
  const filterRows = (where) => notifications.filter((row) => row.idTaiKhoan === where.idTaiKhoan
    && (where.idThongBao === undefined || row.idThongBao === where.idThongBao)
    && (!where.OR || where.OR.some((condition) => row.daDoc === condition.daDoc)));
  const prisma = {
    thongBao: {
      async findMany(query) {
        reads.push(query);
        if (failDatabase) throw new Error("Internal DB exception details");
        return filterRows(query.where).slice(query.skip, query.skip + query.take).map((row) => ({
          ...row, tieu_de: `Notification ${row.idThongBao}`, noiDung: "Plain text content",
          createdAt: new Date("2026-11-19T10:00:00Z"), internal: "private",
        }));
      },
      async count({ where }) { return filterRows(where).length; },
      async updateMany({ where, data }) {
        mutations += 1;
        let count = 0;
        for (const row of filterRows(where)) {
          if (row.daDoc !== data.daDoc) count += 1;
          row.daDoc = data.daDoc;
        }
        return { count };
      },
      async findFirst({ where }) { return filterRows(where)[0] ?? null; },
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
    reads,
    get mutations() { return mutations; },
    notifications,
    async call({ method = "GET", query = "", body = { id: 1 }, rawBody, headers = {} } = {}) {
      const request = new NextRequest(`https://webnovel.example/api/notifications${query}`, {
        method,
        headers: { origin: "https://webnovel.example", "content-type": "application/json", ...headers },
        ...(method === "PUT" ? { body: rawBody ?? JSON.stringify(body) } : {}),
      });
      const response = await routeModule.exports[method](request);
      return { status: response.status, body: await response.json(), headers: response.headers };
    },
  };
}

test("notifications require authentication for reads and writes", async () => {
  const app = harness({ authorized: false });
  assert.equal((await app.call()).status, 401);
  assert.equal((await app.call({ method: "PUT" })).status, 401);
  assert.equal(app.reads.length, 0);
  assert.equal(app.mutations, 0);
});

test("returns only session-owned notifications with unread count across pages", async () => {
  const app = harness();
  const result = await app.call({ query: "?page=1&limit=1" });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.length, 1);
  assert.deepEqual(result.body.meta, { page: 1, limit: 1, total: 3, totalPage: 3, unread: 2 });
  assert.equal(result.body.data[0].idTaiKhoan, undefined);
  assert.equal(result.body.data[0].internal, undefined);
  assert.equal(result.body.data[0].createdAt, "2026-11-19T10:00:00.000Z");
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.equal(app.reads[0].where.idTaiKhoan, 7);
});

test("validates page limits and rejects client account overrides", async () => {
  const app = harness();
  for (const query of ["?limit=51", "?limit=0", "?page=0", "?page=NaN", "?page=1.1", "?page=1000001", "?idTaiKhoan=99"]) {
    assert.equal((await app.call({ query })).status, 400);
  }
  assert.equal(app.reads.length, 0);
});

test("marking one notification is scoped and idempotent", async () => {
  const app = harness();
  assert.equal((await app.call({ method: "PUT", body: { id: 1 } })).body.unread, 1);
  assert.equal((await app.call({ method: "PUT", body: { id: 1 } })).status, 200);
  assert.equal((await app.call({ method: "PUT", body: { id: 4 } })).status, 404);
  assert.equal(app.notifications.find(({ idThongBao }) => idThongBao === 4).daDoc, false);
});

test("mark all never changes another account's notification", async () => {
  const app = harness();
  const result = await app.call({ method: "PUT", body: { all: true } });
  assert.equal(result.status, 200);
  assert.equal(result.body.unread, 0);
  assert.equal(app.notifications.find(({ idThongBao }) => idThongBao === 4).daDoc, false);
});

test("rejects malformed, ambiguous and tampered mutation bodies", async () => {
  const app = harness();
  for (const body of [{}, { all: false }, { id: 0 }, { id: "1" }, { id: 1, all: true }, { id: 1, idTaiKhoan: 99 }]) {
    assert.equal((await app.call({ method: "PUT", body })).status, 400);
  }
  assert.equal((await app.call({ method: "PUT", rawBody: "{" })).status, 400);
  assert.equal(app.mutations, 0);
});

test("cross-origin and cross-site requests cannot mark notifications", async () => {
  const app = harness();
  assert.equal((await app.call({ method: "PUT", headers: { origin: "https://external.example" } })).status, 403);
  assert.equal((await app.call({ method: "PUT", headers: { "sec-fetch-site": "cross-site" } })).status, 403);
  assert.equal(app.mutations, 0);
});

test("database failures do not expose internal errors", async () => {
  const result = await harness({ failDatabase: true }).call();
  assert.equal(result.status, 500);
  assert.doesNotMatch(JSON.stringify(result.body), /Internal DB exception/);
});
