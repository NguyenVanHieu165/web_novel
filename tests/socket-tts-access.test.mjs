import assert from "node:assert/strict";
import test from "node:test";
import { NextResponse } from "next/server";
import { loadNotificationModule } from "./notification-support.mjs";
const passwordVersion = "current-version";
function harness({ free = false, purchased = false, admin = false, active = true, deleted = false, payload = { idTaiKhoan: 7, passwordVersion }, missing = false, databaseFailure = false } = {}) {
  let synthesized = 0;
  const route = loadNotificationModule("app/api/tts/[...path]/route.ts", {
    "next/server": { NextResponse },
    "@/lib/prisma": { prisma: {
      chuong: { findFirst: async args => {
        assert.ok(args.where.truyen.OR, "parent deletion must be checked");
        assert.equal(args.where.truyen.trang_thai.not, "sap_ra_mat");
        if (databaseFailure) throw new Error("DB failure");
        return missing ? null : { tieuDeChuong: "Chapter", isFree: free, giaXu: free ? 0 : 5, noiDungChuong: { noiDung: "Content" } };
      } },
      chuongDaMua: { findUnique: async args => {
        assert.equal(args.where.idTaiKhoan_idChuong.idTaiKhoan, 7);
        return purchased ? { idChuong: 13 } : null;
      } },
    } },
    "@/lib/server/auth-session": { authenticateUser: async token => ({ authorized: Boolean(token && token !== "invalid" && active && !deleted && payload.idTaiKhoan === 7 && payload.passwordVersion === passwordVersion), user: { idTaiKhoan: 7, roles: admin ? ["admin"] : [] } }) },
    "@/lib/server/tts/chunker": { chunkChapterText: text => [text] },
  }, { process: { env: { TTS_WORKER_URL: "https://worker.test", TTS_WORKER_SECRET: "test-secret" } }, fetch: async (_url, options) => {
    assert.equal(_url, "https://worker.test/synthesize");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["Content-Type"], "application/json");
    synthesized++;
    assert.equal(options.headers.Authorization, "Bearer test-secret");
    assert.match(JSON.parse(options.body).cacheKey, /^[a-f0-9]{64}$/u);
    return new Response("audio", { headers: { "content-type": "audio/mpeg" } });
  } });
  return {
    get synthesized() { return synthesized; },
    async request(kind, token = "valid", cookie = true) {
      return route.GET({ cookies: { get: () => cookie && token ? { value: token } : undefined }, headers: new Headers(!cookie && token ? { authorization: `Bearer ${token}` } : {}), nextUrl: new URL("https://app.test") }, { params: Promise.resolve({ path: ["chapters", "13", ...(kind === "meta" ? ["meta"] : ["chunk", "0"])] }) });
    },
  };
}

test("real TTS meta and chunk handlers allow purchased readers and current admins using bound server identities", async () => {
  for (const setup of [{ purchased: true }, { admin: true }]) {
    const h = harness(setup);
    assert.equal((await h.request("meta")).status, 200);
    assert.equal((await h.request("chunk", "valid", false)).status, 200);
    assert.equal(h.synthesized, 1);

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
