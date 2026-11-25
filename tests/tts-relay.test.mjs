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
    const route = loadNotificationModule("app/api/internal/tts-relay/route.ts", { "next/server": { NextResponse }, "msedge-tts": { MsEdgeTTS: FakeTTS, OUTPUT_FORMAT: { AUDIO_24KHZ_48KBITRATE_MONO_MP3: "mp3" } } }, { Buffer, process: { env: { TTS_WORKER_SECRET: "fixture" } }, console: { error() {} } });
    const result = await route.POST(new Request("https://relay.test/api/internal/tts-relay", { method: "POST", headers: { Authorization: mode === "unauthorized" ? "Bearer wrong" : "Bearer fixture" }, body: JSON.stringify({ text: "<Hello> &", voice: mode === "invalid" ? "unknown" : "vi-VN-NamMinhNeural" }) }));
    assert.equal(result.status, { ok: 200, unauthorized: 401, invalid: 400, empty: 502, "edge-error": 502 }[mode]);
    assert.equal(created, ["unauthorized", "invalid"].includes(mode) ? 0 : 1);
    assert.equal(closed, created);
    if (mode === "ok") { assert.equal(result.headers.get("Content-Type"), "audio/mpeg"); assert.equal(await result.text(), "ID3"); }
  }
});
