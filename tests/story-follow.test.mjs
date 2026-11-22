import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { loadNotificationModule } from "./notification-support.mjs";

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require("next/server");
const compiledRoute = ts.transpileModule(await readFile(
  new URL("../app/api/truyen/[slug]/follow/route.ts", import.meta.url), "utf8",
), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

// This double verifies validation, ownership, idempotence and atomic write intent;
// its serialized transactions do not establish MySQL lock/isolation behavior.
function harness({ authorized = true, available = true, failCounter = false } = {}) {
  let state = { followers: new Set(["99:11"]), counter: 1, notifications: [] };
  const events = [];
  const notifications = loadNotificationModule("lib/server/notifications.ts");
  let mutations = 0;
  let queue = Promise.resolve();
  const queryFollow = ({ where }) => {
    const { idTaiKhoan, idTruyen } = where.idTaiKhoan_idTruyen;
    return state.followers.has(`${idTaiKhoan}:${idTruyen}`) ? { idTheoDoiTruyen: 1 } : null;
  };
  const tx = {
    taiKhoan: { async findMany() { return [{ idTaiKhoan: 1 }, { idTaiKhoan: 2 }]; } },
    thongBao: { async createMany({ data }) { state.notifications.push(...data); return { count: data.length }; } },
    async $queryRaw() { return available ? [{ idTruyen: 11, tenTruyen: "Story" }] : []; },
    async $executeRaw(_query, count) {
      if (failCounter) throw new Error("Counter persistence failed");
      state.counter = count;
      return 1;
    },
    theoDoiTruyen: {
      async createMany({ data }) {
        let count = 0;
        for (const item of data) {
          const key = `${item.idTaiKhoan}:${item.idTruyen}`;
          if (!state.followers.has(key)) count += 1;
          state.followers.add(key);
        }
        return { count };
      },
      async deleteMany({ where }) {
        return { count: Number(state.followers.delete(`${where.idTaiKhoan}:${where.idTruyen}`)) };
      },
      async count() { return state.followers.size; },
    },
  };
  const prisma = {
    truyen: {
      async findFirst() { return available ? { idTruyen: 11, _count: { theoDoiTruyen: state.followers.size } } : null; },
    },
    theoDoiTruyen: { async findUnique(query) { return queryFollow(query); } },
    async $transaction(callback) {
      const previous = queue;
      let release;
      queue = new Promise((resolve) => { release = resolve; });
      await previous;
      mutations += 1;
      const snapshot = structuredClone(state);
      try { return await callback(tx); }
      catch (error) { state = snapshot; throw error; }
      finally { release(); }
    },
  };
  const routeModule = { exports: {} };
  vm.runInNewContext(compiledRoute, {
    module: routeModule,
    exports: routeModule.exports,
    console: { error() {} },
    require(name) {
      if (name === "@/lib/server/notifications") return { ...notifications, dispatchNotification: async (event) => { if (event) events.push(event); } };
      if (name === "@/lib/prisma") return { prisma };
      if (name === "@/lib/server/public-cache") return { revalidatePublicStoryDetails() {} };
      if (name === "@/lib/server/auth-session") return {
        requireUser: async () => authorized
          ? { authorized: true, user: { idTaiKhoan: 7, roles: ["user"] } }
          : { authorized: false, response: NextResponse.json({ success: false }, { status: 401 }) },
      };
      return require(name);
    },
  });
  return {
    events,
    get state() { return state; },
    get mutations() { return mutations; },
    async call({ method = "PUT", body = { following: true }, rawBody, slug = "story", headers = {} } = {}) {
      const request = new NextRequest(`https://webnovel.example/api/truyen/${slug}/follow`, {
        method,
        headers: { cookie: "token=test", origin: "https://webnovel.example", "content-type": "application/json", ...headers },
        ...(method === "GET" ? {} : { body: rawBody ?? JSON.stringify(body) }),
      });
      const response = await routeModule.exports[method](request, { params: Promise.resolve({ slug }) });
      return { status: response.status, data: await response.json(), headers: response.headers };
    },
  };
}

test("guests can read a public follow count but cannot mutate followers", async () => {
  const app = harness({ authorized: false });
  const result = await app.call({ method: "GET" });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { success: true, following: false, total: 1 });
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.equal((await app.call()).status, 401);
  assert.equal(app.mutations, 0);
});

test("rejects cross-origin or cross-site mutations", async () => {
  const app = harness();
  assert.equal((await app.call({ headers: { origin: "https://external.example" } })).status, 403);
  assert.equal((await app.call({ headers: { "sec-fetch-site": "cross-site" } })).status, 403);
  assert.equal(app.mutations, 0);
});

test("validates the desired state and never accepts client account identifiers", async () => {
  const app = harness();
  for (const body of [{}, { following: "true" }, { following: true, idTaiKhoan: 99 }, { following: null }]) {
    assert.equal((await app.call({ body })).status, 400);
  }
  assert.equal((await app.call({ rawBody: "{" })).status, 400);
  assert.equal((await app.call({ slug: "x".repeat(301) })).status, 400);
  assert.equal(app.mutations, 0);
});

test("follow persists for the session account and repeated requests do not inflate counts", async () => {
  const app = harness();
  const first = await app.call();
  assert.equal(first.status, 200);
  assert.deepEqual(first.data, { success: true, following: true, total: 2 });
  assert.equal((await app.call()).data.total, 2);
  assert.deepEqual([...app.state.followers].sort(), ["7:11", "99:11"]);
  assert.equal(app.state.counter, 2);
  assert.equal(app.state.notifications.length, 2);
  assert.equal(app.events.length, 1);
  assert.deepEqual(app.state.notifications.map((item) => item.idTaiKhoan), [1, 2]);
  assert.equal((await app.call({ method: "GET" })).data.following, true);
});

test("unfollow affects only the authenticated account and remains idempotent", async () => {
  const app = harness();
  await app.call();
  const result = await app.call({ body: { following: false } });
  assert.deepEqual(result.data, { success: true, following: false, total: 1 });
  assert.equal((await app.call({ body: { following: false } })).data.total, 1);
  assert.deepEqual([...app.state.followers], ["99:11"]);
  assert.equal(app.state.counter, 1);
});

test("missing or deleted stories never change follower state", async () => {
  const app = harness({ available: false });
  assert.equal((await app.call()).status, 404);
  assert.equal((await app.call({ method: "GET" })).status, 404);
  assert.deepEqual([...app.state.followers], ["99:11"]);
});

test("a counter write failure rolls back the relation mutation", async () => {
  const app = harness({ failCounter: true });
  assert.equal((await app.call()).status, 500);
  assert.deepEqual([...app.state.followers], ["99:11"]);
  assert.equal(app.state.counter, 1);
  assert.equal(app.state.notifications.length, 0);
  assert.equal(app.events.length, 0);
});

test("parallel duplicate requests retain one follow under the transaction double", async () => {
  const app = harness();
  const results = await Promise.all([app.call(), app.call()]);
  assert.deepEqual(results.map(({ status }) => status), [200, 200]);
  assert.equal(app.state.followers.size, 2);
  assert.equal(app.state.counter, 2);
  assert.equal(app.state.notifications.length, 2);
  assert.equal(app.events.length, 1);
});
