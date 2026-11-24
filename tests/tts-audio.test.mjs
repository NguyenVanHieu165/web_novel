import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { createRequire } from "node:module";
const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
function loadTypeScript(relativePath) {
  const source = require("node:fs").readFileSync(path.join(root, relativePath), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function("module", "exports", "require", output)(loaded, loaded.exports, require);
  return loaded.exports;
}

test("TTS chunker cleans markup and emits reasonably sized, lossless chunks", () => {
  const { chunkChapterText, cleanChapterText } = loadTypeScript("socket-server/tts/chunker.ts");
  assert.equal(cleanChapterText("<p>Việ\u001b\u0000t</p><img src='x'><script>bad()</script>").trim(), "Việt");
  const source = Array.from({ length: 80 }, (_, i) => `Dòng ${i + 1}: Tiếng Việt đầy đủ và có nhịp kể. Đây là một câu chuyện.`).join("\n");
  const chunks = chunkChapterText(source);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 1_400));
  assert.equal(chunks.join(" ").replace(/\s+/gu, " ").trim(), source.replace(/\s+/gu, " ").trim());
});

test("RAM LRU cache expires, evicts oldest entries and deduplicates concurrent synthesis", async () => {
  const cache = loadTypeScript("socket-server/tts/audioCache.ts");
  cache.clearAudioCacheForTests();
  const { setCachedAudio, getCachedAudio, getOrCreateAudio, audioCacheStats, AUDIO_CACHE_TTL_MS, MAX_AUDIO_CACHE_BYTES } = cache;
  setCachedAudio("a", Buffer.from("A"), 1_000);
  assert.equal(getCachedAudio("a", 1_000)?.toString(), "A");
  assert.equal(getCachedAudio("a", 1_000 + AUDIO_CACHE_TTL_MS), undefined);
  setCachedAudio("large", Buffer.alloc(MAX_AUDIO_CACHE_BYTES - 1, 1));
  setCachedAudio("tail", Buffer.alloc(2, 2));
  assert.equal(getCachedAudio("large"), undefined);
  let synthesisCount = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const synth = async () => { synthesisCount++; await gate; return Buffer.from("MP3"); };
  const first = getOrCreateAudio("same", synth);
  const second = getOrCreateAudio("same", synth);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(synthesisCount, 1);
  release();
  assert.equal((await first).toString(), "MP3");
  assert.equal((await second).toString(), "MP3");
  assert.equal(audioCacheStats().inFlight, 0);
  assert.equal((await getOrCreateAudio("same", synth)).toString(), "MP3");
  assert.equal(synthesisCount, 1);
  cache.clearAudioCacheForTests();
});

test("Vercel deployment excludes socket-server and tests from its bundle boundary", async () => {
  const ignore = await readFile(path.join(root, ".vercelignore"), "utf8");
  assert.match(ignore, /^\/socket-server\//mu);
  assert.match(ignore, /^\/tests\/$/mu);
});
