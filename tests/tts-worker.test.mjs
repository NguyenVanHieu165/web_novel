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

function synthesisHarness({ status = 101, mode = "audio" } = {}) {
  const handlers = {};
  const writes = [], pending = [], logs = [];
  let sends = 0;
  const ws = { accept() {}, close() {}, addEventListener(name, fn) { handlers[name] = fn; }, send() {
    if (++sends !== 2) return;
    queueMicrotask(() => {
      if (mode === "close") return handlers.close({ code: 1008, reason: "denied" });
      if (mode === "timeout") return;
      const header = new TextEncoder().encode("Path:audio\r\n");
      const frame = new Uint8Array(2 + header.length + 3);
      new DataView(frame.buffer).setUint16(0, header.length); frame.set(header, 2); frame.set([1, 2, 3], 2 + header.length);
      handlers.message({ data: frame.buffer });
      handlers.message({ data: "Path:turn.end\r\n" });
    });
  } };
  const worker = loadNotificationModule("tts-worker/src/index.ts", { "./sec-ms-gec": { TOKEN: "fixture", generateSecMsGec: async () => "gec" } }, {
    Response, ReadableStream, TextDecoder, crypto: webcrypto,
    console: { error: (...args) => logs.push(args) },
    setTimeout: fn => setTimeout(fn, 20),
    fetch: async (_url, options) => {
      assert.match(options.headers["User-Agent"], /Edg\/143/u);
      return { status, webSocket: status === 101 ? ws : null };
    },
  }).default;
  return { logs, writes, run: () => worker.fetch(new Request("https://worker.test/synthesize", { method: "POST", headers: { Authorization: "Bearer fixture" }, body: JSON.stringify({ cacheKey: "b".repeat(64), text: "Hello", voice: "vi-VN-HoaiMyNeural" }) }), { TTS_WORKER_SECRET: "fixture", TTS_BUCKET: { get: async () => null, put: async (_key, bytes) => writes.push(bytes) } }, { waitUntil: value => pending.push(value) }), finish: () => Promise.all(pending) };
}
test("Worker returns logged 502 for Edge 403, premature close and first-audio timeout", async () => {
  for (const setup of [{ status: 403 }, { mode: "close" }, { mode: "timeout" }]) {
    const h = synthesisHarness(setup);
    const response = await h.run();
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.match(body.detail, /403|1008|timeout/u);
    assert.ok(h.logs.length);
    assert.equal(h.writes.length, 0);
  }
});
test("Worker streams first audio and caches only completed MP3", async () => {
  const h = synthesisHarness();
  const response = await h.run();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "audio/mpeg");
  assert.equal(response.headers.get("X-TTS-Cache"), "MISS");
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
  await h.finish();
  assert.equal(h.writes.length, 1);
});
