import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";
import { loadNotificationModule } from "./notification-support.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
test("Worker GEC v2 matches installed Edge implementation at five-minute boundaries", async () => {
  const { hashSecMsGecV2 } = require("../node_modules/msedge-tts/dist/SecMsGec.js");
  const worker = loadNotificationModule("tts-worker/src/sec-ms-gec.ts", {}, { crypto: webcrypto });
  for (const now of [0, 1799999999999, 1800000000000]) {
    const seconds = Math.floor(now / 1000) + 11644473600;
    assert.equal(await worker.generateSecMsGec(now), await hashSecMsGecV2(`${BigInt(seconds - seconds % 300) * 10000000n}${worker.TOKEN}`));
  }
});
test("new chunker produces short first chunk without losing normalized content", () => {
  const { chunkChapterText, cleanChapterText } = loadNotificationModule("lib/server/tts/chunker.ts");
  const input = "<p>Xin chào bạn đọc. </p>".repeat(300);
  const chunks = chunkChapterText(input);
  assert.ok(chunks[0].length <= 180);
  assert.equal(chunks.join(" ").replace(/\s+/gu, " "), cleanChapterText(input).replace(/\s+/gu, " "));
});

test("Markdown links retain readable labels", () => {
  const { cleanChapterText } = loadNotificationModule("lib/server/tts/chunker.ts");
  assert.equal(cleanChapterText("[Nội dung](https://example.com)"), "Nội dung");
});
test("Worker enforces bearer auth before R2 and returns cache hit contract", async () => {
  let reads = 0;
  const worker = loadNotificationModule("tts-worker/src/index.ts", { "./sec-ms-gec": {} }, { Response }).default;
  const env = { TTS_WORKER_SECRET: "fixture", TTS_BUCKET: { get: async key => {
    reads++; assert.equal(key, `chunks/${"a".repeat(64)}.mp3`);
    return { body: new Response("mp3").body };
  } } };
  const body = JSON.stringify({ cacheKey: "a".repeat(64), text: "Xin chào", voice: "vi-VN-HoaiMyNeural" });
  const request = secret => new Request("https://worker.test/synthesize", { method: "POST", headers: { Authorization: `Bearer ${secret}` }, body });
  assert.equal((await worker.fetch(request("wrong"), env, {})).status, 401);
  assert.equal(reads, 0);
  const response = await worker.fetch(request("fixture"), env, {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "audio/mpeg");
  assert.equal(response.headers.get("X-TTS-Cache"), "HIT-R2");
  assert.equal(await response.text(), "mp3");
});

test("R2 MISS calls authenticated Vercel relay and caches only valid MP3", async () => {
  for (const mode of ["ok", "http", "redirect", "type", "empty", "network"]) {
    const writes = [], pending = [];
    const worker = loadNotificationModule("tts-worker/src/index.ts", {}, { Response, console: { error() {} }, fetch: async (url, options) => {
      assert.equal(String(url), "https://relay.test/api/internal/tts-relay");
      assert.equal(options.method, "POST");
      assert.equal(options.redirect, "manual");
      assert.equal(options.headers.Authorization, "Bearer fixture");
      assert.deepEqual(JSON.parse(options.body), { text: "Hello", voice: "vi-VN-HoaiMyNeural" });
      if (mode === "network") throw new Error("unreachable");
      return new Response(mode === "empty" ? "" : "ID3", { status: mode === "http" ? 502 : mode === "redirect" ? 307 : 200, headers: { "Content-Type": mode === "type" ? "application/json" : "audio/mpeg" } });
    } }).default;
    const result = await worker.fetch(new Request("https://worker.test/synthesize", { method: "POST", headers: { Authorization: "Bearer fixture" }, body: JSON.stringify({ cacheKey: "b".repeat(64), text: "Hello", voice: "vi-VN-HoaiMyNeural" }) }), { TTS_WORKER_SECRET: "fixture", VERCEL_TTS_RELAY_URL: "https://relay.test/api/internal/tts-relay", TTS_BUCKET: { get: async () => null, put: async (key, bytes) => writes.push({ key, bytes }) } }, { waitUntil: p => pending.push(p) });
    assert.equal(result.status, mode === "ok" ? 200 : 502);
    await Promise.all(pending);
    assert.equal(writes.length, mode === "ok" ? 1 : 0);
    if (mode === "ok") {
      assert.equal(result.headers.get("Content-Type"), "audio/mpeg");
      assert.equal(result.headers.get("X-TTS-Cache"), "MISS");
      assert.equal(await result.text(), "ID3");
      assert.equal(writes[0].key, `chunks/${"b".repeat(64)}.mp3`);
    }
  }
});

test("Worker retries transient relay HTTP status once, sharing its deadline", async () => {
  for (const status of [502, 503, 504, 401, 400]) {
    let calls = 0, signal;
    const pending = [], writes = [];
    const worker = loadNotificationModule("tts-worker/src/index.ts", {}, { Response, console: { error() {} }, fetch: async (_url, options) => {
      calls++;
      if (!signal) signal = options.signal;
      assert.equal(options.signal, signal);
      return calls === 1 ? new Response("failed", { status }) : new Response("MP3", { headers: { "Content-Type": "audio/mpeg" } });
    } }).default;
    const result = await worker.fetch(new Request("https://worker.test/synthesize", { method: "POST", headers: { Authorization: "Bearer fixture" }, body: JSON.stringify({ cacheKey: "b".repeat(64), text: "Hello", voice: "vi-VN-HoaiMyNeural" }) }), { TTS_WORKER_SECRET: "fixture", VERCEL_TTS_RELAY_URL: "https://relay.test/api/internal/tts-relay", TTS_BUCKET: { get: async () => null, put: async (_key, bytes) => writes.push(bytes) } }, { waitUntil: p => pending.push(p) });
    const retryable = [502, 503, 504].includes(status);
    assert.equal(result.status, retryable ? 200 : 502);
    assert.equal(calls, retryable ? 2 : 1);
    await Promise.all(pending);
    assert.equal(writes.length, retryable ? 1 : 0);
  }
});
