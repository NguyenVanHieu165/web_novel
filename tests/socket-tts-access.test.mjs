import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { loadNotificationModule } from "./notification-support.mjs";

const passwordHash = "stored-password-hash";
const passwordVersion = createHash("sha256").update(passwordHash).digest("hex");

function harness({ free = false, purchased = false, admin = false, active = true, deleted = false, payload = { idTaiKhoan: 7, passwordVersion }, missing = false, databaseFailure = false } = {}) {
  const routes = new Map(), queries = [];
  let synthesized = 0;
  const pool = {
    async query(sql, values) {
      if (databaseFailure) throw new Error("fixture database failure");
      queries.push({ sql, values });
      assert.equal((sql.match(/\?/gu) ?? []).length, values.length, "every placeholder must have exactly one binding");
      if (/FROM chuong c/u.test(sql)) return missing ? [] : [{ idChuong: 13, idTruyen: 2, title: "VIP chapter", isFree: free, giaXu: free ? 0 : 5, content: "Nội dung chương đủ để nghe." }];
      assert.match(sql, /trang_thai\s*=\s*'active'/u);
      assert.match(sql, /is_deleted\s*=\s*0/u);
      assert.match(sql, /is_deleted\s+IS\s+NULL/iu);
      if (/passwordHash/u.test(sql)) {
        assert.deepEqual(Array.from(values), [7]);
        return active && !deleted ? [{ passwordHash }] : [];
      }
      assert.match(sql, /AS validUser/u);
      assert.deepEqual(Array.from(values), [7, 13, 7], "purchase identity, chapter and account identity must stay ordered");
      return active && !deleted ? [{ validUser: 1, purchased: Number(purchased), isAdmin: Number(admin) }] : [];
    },
  };
  const app = { disable() {}, use() {}, get: (route, handler) => routes.set(route, handler), post() {} };
  const express = Object.assign(() => app, { json: () => () => {} });
  class SocketServer { use() {} on() {} }
  loadNotificationModule("socket-server/server.ts", {
    dotenv: { config() {} }, express, cors: () => () => {},
    http: { createServer: () => ({ listen() {}, close() {} }) },
    "socket.io": { Server: SocketServer },
    jose: { jwtVerify: async token => {
      if (token === "invalid") throw new Error("invalid signature");
      return { payload };
    } },
    "msedge-tts": {},
    "./tts/chunker": { chunkChapterText: content => [content] },
    "./tts/audioCache": { getOrCreateAudio: async () => { synthesized++; return Buffer.from("audio"); } },
    "./jobs/config": { loadWorkerConfig: () => ({ database: {} }) },
    "./jobs/database": { createJobPool: () => pool },
    "./auth/socketAuth": {},
    "./onlineStats": { OnlinePresenceTracker: class {} },
    "./handlers/notificationDispatch": {}, "./handlers/notification": {}, "./handlers/collaborative": {},
  }, { Buffer, process: { env: { JWT_SECRET: "test-only", INTERNAL_SECRET_TOKEN: "test-only" }, once() {} } });
  return {
    queries,
    get synthesized() { return synthesized; },
    async request(kind, token = "valid", cookie = true) {
      const result = { status: 200 };
      const response = {
        status(value) { result.status = value; return this; },
        set() { return this; },
        json(body) { result.body = body; return result; },
        send(body) { result.body = body; return result; },
      };
      const handler = routes.get(kind === "meta" ? "/api/tts/chapters/:chapterId/meta" : "/api/tts/chapters/:chapterId/chunk/:index");
      await handler({ params: { chapterId: "13", index: "0" }, query: {}, headers: token ? (cookie ? { cookie: `token=${token}` } : { authorization: `Bearer ${token}` }) : {} }, response);
      return result;
    },
  };
}

test("real TTS meta and chunk handlers allow purchased readers and current admins using bound server identities", async () => {
  for (const setup of [{ purchased: true }, { admin: true }]) {
    const h = harness(setup);
    assert.equal((await h.request("meta")).status, 200);
    assert.equal((await h.request("chunk", "valid", false)).status, 200);
    assert.equal(h.synthesized, 1);
    assert.ok(h.queries.some(query => /AS validUser/u.test(query.sql)));
  }
});

test("VIP audio rejects guests, nonbuyers, locked/deleted accounts and stale or missing password versions", async () => {
  for (const setup of [{}, { purchased: true, active: false }, { purchased: true, deleted: true }, { purchased: true, payload: { idTaiKhoan: 7, passwordVersion: "old-version" } }, { admin: true, payload: { idTaiKhoan: 7 } }]) {
    const h = harness(setup);
    for (const kind of ["meta", "chunk"]) assert.ok([401, 403].includes((await h.request(kind)).status));
    assert.equal(h.synthesized, 0);
  }
  const guest = harness({ purchased: true });
  assert.equal((await guest.request("meta", null)).status, 401);
  assert.equal((await guest.request("chunk", null)).status, 401);
  assert.equal(guest.synthesized, 0);
});

test("free audio stays public and malformed encoded cookies cannot cause a server error", async () => {
  const h = harness({ free: true });
  assert.equal((await h.request("meta", null)).status, 200);
  assert.equal((await h.request("chunk", "%invalid")).status, 200);
  const missing = harness({ missing: true });
  assert.equal((await missing.request("meta", null)).status, 404);
});

test("invalid JWT identities never acquire VIP access and database failures return a retryable error", async () => {
  const invalid = harness({ purchased: true });
  for (const kind of ["meta", "chunk"]) assert.equal((await invalid.request(kind, "invalid")).status, 401);
  for (const idTaiKhoan of [0, -1, "7", 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const h = harness({ purchased: true, payload: { idTaiKhoan, passwordVersion } });
    assert.equal((await h.request("meta")).status, 401);
    assert.equal(h.synthesized, 0);
  }
  const failed = harness({ purchased: true, databaseFailure: true });
  assert.equal((await failed.request("meta")).status, 503);
  assert.equal((await failed.request("chunk")).status, 503);
  assert.equal(failed.synthesized, 0);
});
