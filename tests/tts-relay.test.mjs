import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { loadNotificationModule } from "./notification-support.mjs";

test("relay authenticates, validates, escapes SSML and always closes Edge", async () => {
  for (const mode of ["ok", "unauthorized", "invalid", "empty", "edge-error"]) {
    let created = 0, closed = 0;
    class FakeTTS {
      constructor() { created++; }
      async setMetadata(voice) { assert.equal(voice, "vi-VN-NamMinhNeural"); if (mode === "edge-error") throw new Error("Edge unavailable"); }
      rawToStream(ssml) { assert.ok(ssml.includes("&lt;Hello&gt; &amp;")); return { audioStream: Readable.from(mode === "empty" ? [] : [Buffer.from("ID3")]) }; }
      close() { closed++; }
    }
    const route = loadNotificationModule("app/api/internal/tts-relay/route.ts", { "next/server": { NextResponse }, "msedge-tts": { MsEdgeTTS: FakeTTS, OUTPUT_FORMAT: { AUDIO_24KHZ_48KBITRATE_MONO_MP3: "mp3" } } }, { Buffer, Error, process: { env: { TTS_WORKER_SECRET: "fixture" } }, console: { error() {} } });
    const result = await route.POST(new Request("https://relay.test/api/internal/tts-relay", { method: "POST", headers: { Authorization: mode === "unauthorized" ? "Bearer wrong" : "Bearer fixture" }, body: JSON.stringify({ text: "<Hello> &", voice: mode === "invalid" ? "unknown" : "vi-VN-NamMinhNeural" }) }));
    assert.equal(result.status, { ok: 200, unauthorized: 401, invalid: 400, empty: 502, "edge-error": 502 }[mode]);
    assert.equal(created, ["unauthorized", "invalid"].includes(mode) ? 0 : ["empty", "edge-error"].includes(mode) ? 3 : 1);
    assert.equal(closed, created);
    if (mode === "ok") { assert.equal(result.headers.get("Content-Type"), "audio/mpeg"); assert.equal(await result.text(), "ID3"); }
  }
});

test("relay retries fresh Edge instances and stops at first success", async () => {
  for (const failures of [1, 2, 3]) {
    let created = 0, closed = 0;
    class FakeTTS {
      constructor() { this.attempt = ++created; }
      async setMetadata() { if (this.attempt <= failures) throw new Error("private upstream token"); }
      rawToStream() { return { audioStream: Readable.from([Buffer.from("MP3")]) }; }
      close() { closed++; }
    }
    const route = loadNotificationModule("app/api/internal/tts-relay/route.ts", { "next/server": { NextResponse }, "msedge-tts": { MsEdgeTTS: FakeTTS, OUTPUT_FORMAT: { AUDIO_24KHZ_48KBITRATE_MONO_MP3: "mp3" } } }, { Buffer, Error, process: { env: { TTS_WORKER_SECRET: "fixture" } }, console: { error() {} } });
    const response = await route.POST(new Request("https://relay.test/api/internal/tts-relay", { method: "POST", headers: { Authorization: "Bearer fixture" }, body: JSON.stringify({ text: "Hello", voice: "vi-VN-HoaiMyNeural" }) }));
    assert.equal(response.status, failures === 3 ? 502 : 200);
    assert.equal(created, Math.min(failures + 1, 3));
    assert.equal(closed, created);
    if (failures === 3) assert.deepEqual(await response.json(), { error: "TTS_RELAY_FAILED", detail: "Error" });
  }
});

test("relay hard deadline releases hung metadata and pre-aborted requests do not retry", async () => {
  let created = 0, closed = 0;
  class HungTTS {
    constructor() { created++; }
    setMetadata() { return new Promise(() => {}); }
    close() { closed++; }
  }
  const route = loadNotificationModule("app/api/internal/tts-relay/route.ts", { "next/server": { NextResponse }, "msedge-tts": { MsEdgeTTS: HungTTS, OUTPUT_FORMAT: { AUDIO_24KHZ_48KBITRATE_MONO_MP3: "mp3" } } }, { Buffer, Error, process: { env: { TTS_WORKER_SECRET: "fixture" } }, console: { error() {} }, setTimeout: (fn, delay) => setTimeout(fn, delay === 12000 ? 5 : 1) });
  const request = signal => new Request("https://relay.test/api/internal/tts-relay", { method: "POST", headers: { Authorization: "Bearer fixture" }, body: JSON.stringify({ text: "Hello", voice: "vi-VN-HoaiMyNeural" }), signal });
  const response = await route.POST(request());
  assert.equal(response.status, 502);
  assert.equal((await response.json()).detail, "Edge synthesis deadline exceeded");
  assert.equal(created, 3);
  assert.ok(closed >= 3);
  await route.POST(request(AbortSignal.abort()));
  assert.equal(created, 3);
});
